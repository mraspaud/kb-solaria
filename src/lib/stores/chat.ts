// src/lib/stores/chat.ts
import { writable, get } from 'svelte/store';
import { Workspace } from '../logic/Workspace';
import { BucketAnalyzer } from '../logic/BucketAnalyzer';
import { type ChannelIdentity, type Message, type UnreadState, type UserIdentity, Bucket, type ChatState } from '../logic/types';

function createChatStore() {
    const workspace = new Workspace();

    const triageChannel: ChannelIdentity = {
        id: 'triage',
        name: 'triage',
        service: { id: 'aggregation', name: 'Solaria' }
    };
    const inboxChannel: ChannelIdentity = {
        id: 'inbox',
        name: 'inbox',
        service: { id: 'aggregation', name: 'Solaria' }
    };
    const systemChannel: ChannelIdentity = {
        id: 'system',
        name: 'system',
        service: { id: 'internal', name: 'Solaria' }
    };

    const store = writable<ChatState>({
        // 1. THE DATABASE
        entities: {
            messages: new Map(),
            channels: new Map(),
            users: new Map()
        },
        // 2. THE VIEWS (Pointer to Workspace logic mainly, but exposed if needed)
        buffers: new Map(),

        activeChannel: triageChannel,
        availableChannels: [triageChannel, inboxChannel, systemChannel],
        
        // DEPRECATED (But kept for UI compatibility for now)
        messages: [],
        
        cursorIndex: -1,
        isAttached: true,
        unread: {},
        identities: {},
        currentUser: null,
        users: new Map(),
        participatedThreads: new Set(),
        virtualCounts: {triage: 0, inbox: 0}
    });

    workspace.openChannel(triageChannel);
    workspace.openChannel(inboxChannel);
    workspace.openChannel(systemChannel);
    workspace.activeChannel = triageChannel;

    let activeBufferUnsubscribe: (() => void) | null = null;

    // --- SYNCHRONIZATION (The Glue) ---
    const syncState = () => {
        const win = workspace.getActiveWindow();
        const buf = workspace.getActiveBuffer();
        
        if (!workspace.activeChannel) return; 

        store.update(s => {
            // A. Get IDs from Buffer
            const currentIds = buf.messageIds;

            // B. Reconstruct Object Array (Hydration Layer)
            // This is the "O(N) lookup" we discussed.
            const hydratedMessages = currentIds
                .map(id => s.entities.messages.get(id))
                .filter((m): m is Message => !!m); // Filter out undefined (safety)

            // C. Sync Buffers Map (For debug/inspection)
            const newBuffers = new Map(s.buffers);
            newBuffers.set(workspace.activeChannel.id, currentIds);

            return {
                ...s, 
                activeChannel: workspace.activeChannel,
                messages: hydratedMessages, // <--- UI consumes this
                cursorIndex: win.cursorIndex,
                isAttached: win.isAttached,
                buffers: newBuffers
            };
        });
    };

    workspace.subscribe(() => {
        setupActiveBufferListener();
        syncState();
    });

    function setupActiveBufferListener() {
        if (activeBufferUnsubscribe) activeBufferUnsubscribe();
        activeBufferUnsubscribe = workspace.getActiveBuffer().subscribe(() => {
            syncState();
        });
    }

    setupActiveBufferListener();

    const updateVirtualCounts = (s: ChatState) => {
        const triageBuf = workspace.getBuffer('triage');
        const inboxBuf = workspace.getBuffer('inbox');
        return {
            ...s,
            virtualCounts: {
                triage: triageBuf ? triageBuf.messageIds.length : 0,
                inbox: inboxBuf ? inboxBuf.messageIds.length : 0
            }
        };
    };

    return {
        subscribe: store.subscribe,

        // For tests

        reset: () => {
            // 1. Reset Workspace (Buffers/Windows)
            workspace.reset(); 
            
            // 2. Reset Store (DB/Metadata)
            store.set({
                entities: { messages: new Map(), channels: new Map(), users: new Map() },
                buffers: new Map(),
                activeChannel: triageChannel,
                availableChannels: [triageChannel, inboxChannel, systemChannel],
                messages: [],
                cursorIndex: -1,
                isAttached: true,
                unread: {},
                identities: {},
                currentUser: null,
                users: new Map(),
                participatedThreads: new Set(),
                virtualCounts: {triage: 0, inbox: 0}
            });
            
            // 3. Re-open defaults
            workspace.openChannel(triageChannel);
            workspace.openChannel(inboxChannel);
            workspace.openChannel(systemChannel);
        },
        // --- ACTION: DISPATCH (Normalized) ---
        dispatchMessage: (channel: ChannelIdentity, msg: Message) => {
            // FIX 1: Normalize Context First
            if (!msg.sourceChannel) {
                msg.sourceChannel = channel;
            }

            // A. Update Database (Pure State Mutation)
            store.update(s => {
                const db = s.entities.messages;
                db.set(msg.id, msg);
                return s; // Minimal update to notify DB listeners
            });

            // B. Analyze & Route (Side Effects)
            // We do this OUTSIDE the store.update to prevent locking/nesting issues
            const state = get(store); // Safe snapshot
            const myIdentity = state.identities[channel.service.id];
            const myThreads = state.participatedThreads;
            const isMe = myIdentity && msg.author.id === myIdentity.id;

            if (isMe && msg.threadId) {
                // Update threads set (Mutation required)
                store.update(s => {
                    s.participatedThreads.add(msg.threadId!);
                    return s;
                });
            }

            let threadReadAt = 0;
            if (msg.threadId) {
                // Construct the ID we use for threads in our system
                const internalThreadId = `thread_${msg.threadId}`;
                
                // 1. Check if we have an open/known channel identity for this thread
                const threadMeta = state.availableChannels.find(c => c.id === internalThreadId);
                if (threadMeta) {
                    threadReadAt = threadMeta.lastReadAt || 0;
                }
            }

            console.log(msg)
            const verdict = BucketAnalyzer.classify(msg, channel, myIdentity, myThreads);
            console.log(verdict)
            // Tagging the object (Reference mutation is fine here as it's in the Map)
            msg.bucket = verdict; 

            // C. Dispatch to Buffers (Triggers Buffer Listeners -> syncState)
            // This will trigger a NEW store.update via syncState(), which is now allowed
            workspace.dispatchMessageId(channel, msg.id);

            // Virtual Routing
            if (verdict === Bucket.EGO || verdict === Bucket.CONTEXT) {
                workspace.dispatchMessageId(triageChannel, msg.id);
            } else if (verdict === Bucket.SIGNAL) {
                workspace.dispatchMessageId(inboxChannel, msg.id);
            }

            // D. Metadata & Counts (Separate Update)
            store.update(s => {
                 // 1. Channel Metadata (Last Post)
                 let channelExists = false;
                 const updatedChannels = s.availableChannels.map(c => {
                    if (c.id === channel.id) {
                        channelExists = true;
                        return { ...c, lastPostAt: msg.timestamp.getTime() / 1000 };
                    }
                    return c;
                 });
                 if (!channelExists) {
                    updatedChannels.push({ ...channel, lastPostAt: msg.timestamp.getTime() / 1000 });
                 }

                 // 2. Unread Logic
                 let newUnread = s.unread;
                 if (channel.id !== s.activeChannel.id && !isMe && verdict !== Bucket.NOISE) {
                    const current = s.unread[channel.id] || { count: 0, hasMention: false };
                    const isMention = (verdict === Bucket.EGO);
                    newUnread = {
                        ...s.unread,
                        [channel.id]: {
                            count: current.count + 1,
                            hasMention: current.hasMention || isMention
                        }
                    };
                 }

                 const nextState = {
                    ...s,
                    availableChannels: updatedChannels,
                    unread: newUnread
                 };
                 
                 return updateVirtualCounts(nextState);
            });
        },

        // ... (handleReaction, setIdentity, upsertChannels, etc. remain largely same 
        // because they touch metadata, but handleReaction needs DB access)

        handleReaction: (channelId: string, msgId: string, emoji: string, userId: string, action: 'add' | 'remove') => {
             store.update(s => {
                 // DIRECT DB UPDATE
                 const msg = s.entities.messages.get(msgId);
                 if (msg) {
                    if (!msg.reactions) msg.reactions = {};
                    let users = msg.reactions[emoji] || [];
                    
                    if (action === 'add') {
                        if (!users.includes(userId)) users.push(userId);
                    } else {
                        users = users.filter(u => u !== userId);
                    }
                    
                    if (users.length > 0) msg.reactions[emoji] = users;
                    else delete msg.reactions[emoji];
                    
                    // Force reactivity by returning new state (even if strictly mutation)
                    // In Svelte stores, returning the object triggers subscribers.
                 }
                 return s;
             });
             // The buffer didn't change (IDs are same), but content did.
             // We force a sync to refresh the UI's view of the objects.
             syncState();
        },

        moveCursor: (delta: number) => {
            workspace.getActiveWindow().moveCursor(delta);
            syncState(); 
        },

        jumpTo: (index: number) => {
            const win = workspace.getActiveWindow();
            // Access IDs length
            const max = workspace.getActiveBuffer().messageIds.length - 1;
            win.cursorIndex = Math.max(0, Math.min(index, max));
            win.isAttached = (win.cursorIndex >= max);
            syncState();
        },

        jumpToBottom: () => {
            workspace.getActiveWindow().jumpToBottom();
            syncState();
        },

        switchChannel: (channel: ChannelIdentity, targetMessageId?: string) => {
            if (!channel) return;
            store.update(s => {
                const serviceIdentity = s.identities[channel.service.id] || null;
                if (s.activeChannel.id !== channel.id) {
                    workspace.pushToHistory(s.activeChannel);
                }
                return { ...s, currentUser: serviceIdentity };
            });

            workspace.openChannel(channel);
            const win = workspace.getActiveWindow();
            
            if (targetMessageId) {
                const buf = workspace.getActiveBuffer();
                // Find index of ID
                const idx = buf.messageIds.indexOf(targetMessageId);
                
                if (idx !== -1) {
                    win.cursorIndex = idx;
                    win.isAttached = (idx >= buf.messageIds.length - 1);
                } else {
                    win.isAttached = true;
                    win.cursorIndex = buf.messageIds.length - 1;
                }
            } else {
                 win.isAttached = false;
            }
            syncState();
        },

        openThread: (msg: Message) => {
            const currentChan = workspace.activeChannel;
            const contextChannel = (currentChan.service.id === 'aggregation' && msg.sourceChannel) 
                ? msg.sourceChannel 
                : currentChan;
            
            // Pass IDs + Object (for now, until Workspace is fully normalized)
            workspace.openThread(msg.id, contextChannel, msg);
            syncState();
        },

        goBack: () => {
            workspace.goBack();
            syncState();
        },

        detach: () => {
            workspace.getActiveWindow().detach();
            syncState();
        },

        updateMessage: (id: string, newContent: string) => {
            store.update(s => {
                const msg = s.entities.messages.get(id);
                if (msg) {
                    msg.content = newContent;
                }
                return s;
            });
            syncState();
        },

        removeMessage: (id: string) => {
            store.update(s => {
                // We keep it in DB? Or delete?
                // For now, let's keep in DB (for potential undo/history) 
                // but remove from Buffer.
                
                // If we want to truly delete, we'd delete from map too.
                // But typically "delete" just means "hide from view".
                // s.entities.messages.delete(id); 
                return s;
            });

            // Remove from buffer
            workspace.getActiveBuffer().removeMessageId(id);
            
            // Cursor adjustment logic
            const win = workspace.getActiveWindow();
            const buf = workspace.getActiveBuffer();
            const max = buf.messageIds.length - 1;
            
            if (win.cursorIndex > max) win.cursorIndex = max;
            if (max < 0) win.cursorIndex = -1;
            
            win.isAttached = (win.cursorIndex === max);
            syncState();
        },

        // Helper accessors
        getLastMessageId: (channel: ChannelIdentity) => workspace.getLastMessageId(channel),
        
        // Metadata setters (upsertChannels, upsertUsers, setIdentity, etc.) 
        // remain fundamentally the same as they operate on the separate 
        // `users` and `channels` maps/arrays, which we haven't strictly normalized yet.
        upsertChannels: (newChannels: ChannelIdentity[]) => {
            store.update(s => {
                const currentChannels = s.availableChannels || [];
                const channelMap = new Map(currentChannels.map(c => [c.id, c]));
                for (const ch of newChannels) {
                    const existing = channelMap.get(ch.id);
                    channelMap.set(ch.id, existing ? { ...existing, ...ch } : ch);
                }
                return { ...s, availableChannels: Array.from(channelMap.values()) };
            });
        },

        handleAck: (tempId: string, realId: string, serverContent?: string) => {
            store.update(s => {
                const db = s.entities.messages;

                // PATH A: Identity Match (Rocket.Chat)
                // The ID is already correct. We just need to confirm it.
                if (tempId === realId) {
                    const msg = db.get(tempId);
                    if (msg) {
                        // Create a new object reference with updated fields
                        db.set(tempId, { 
                            ...msg, 
                            status: 'sent',
                            content: serverContent || msg.content,
                            timestamp: new Date() // Sync time with confirmation
                        });
                    }
                    return s;
                }

                // PATH B: Identity Swap (Slack/Mattermost)
                // The ID changed. We must move the record.
                const pendingMsg = db.get(tempId);
                if (!pendingMsg) return s;

                db.delete(tempId);
                
                const existingReal = db.get(realId);
                if (existingReal) {
                    // Merge: The Real message arrived via WS before this Ack.
                    // Just update its local status to 'sent'.
                    db.set(realId, { ...existingReal, status: 'sent', clientId: tempId });
                } else {
                    // Swap: The Real message hasn't arrived yet.
                    // Re-create the pending message at the new ID.
                    db.set(realId, {
                        ...pendingMsg,
                        id: realId,
                        clientId: tempId,
                        status: 'sent',
                        content: serverContent || pendingMsg.content,
                        timestamp: new Date()
                    });
                }
                return s;
            });

            // 2. WORKSPACE BUFFER UPDATE
            // If we took Path A (IDs match), the buffers are already correct. 
            // We just updated the DB status above. STOP HERE.
            if (tempId === realId) {
                syncState();
                return;
            }

            // Path B: Fix Buffer References
            const state = get(store);
            
            const updateBuffer = (buf: any) => {
                if (!buf) return;
                const ids = buf.messageIds;
                const tempIdx = ids.indexOf(tempId);
                const realIdx = ids.indexOf(realId);

                if (tempIdx !== -1) {
                    if (realIdx !== -1) {
                        // Duplicate detected (Both exist): Remove Temp, keep Real
                        ids.splice(tempIdx, 1);
                    } else {
                        // Normal Swap: Only Temp exists
                        ids[tempIdx] = realId;
                    }
                }
            };

            for (const chan of state.availableChannels) {
                updateBuffer(workspace.getBuffer(chan.id));
            }
            ['triage', 'inbox'].forEach(vid => {
                 updateBuffer(workspace.getBuffer(vid));
            });

            syncState();
        },

        upsertUsers: (newUsers: UserIdentity[]) => {
            store.update(s => {
                const updated = new Map(s.users);
                newUsers.forEach(u => updated.set(u.id, u));
                if (s.currentUser && !updated.has(s.currentUser.id)) {
                    updated.set(s.currentUser.id, s.currentUser);
                }
                return { ...s, users: updated };
            });
        },

        setIdentity: (serviceId: string, user: UserIdentity) => {
            store.update(s => {
                const userWithService = { ...user, serviceId };
                const newIdentities = { ...s.identities, [serviceId]: userWithService };
                let newCurrent = s.currentUser;
                if (s.activeChannel.service.id === serviceId) {
                    newCurrent = userWithService;
                }
                const newUsers = new Map(s.users);
                newUsers.set(user.id, userWithService);
                return { 
                    ...s, 
                    identities: newIdentities,
                    currentUser: newCurrent,
                    users: newUsers
                };
            });
        },
        
        hydrateParticipatedThreads: (threadIds: string[]) => {
             store.update(s => {
                const newThreads = new Set(s.participatedThreads);
                threadIds.forEach(id => newThreads.add(id));
                return { ...s, participatedThreads: newThreads };
            });
        },

        updateUnreadState: (channelId: string, count: number, hasMention: boolean) => {
             store.update(s => {
                const current = s.unread[channelId] || { count: 0, hasMention: false };
                return {
                    ...s,
                    unread: {
                        ...s.unread,
                        [channelId]: {
                            count: Math.max(current.count, count),
                            hasMention: current.hasMention || hasMention
                        }
                    }
                };
            });
        },

        markReadUpTo: (channel: ChannelIdentity, message: Message | null) => {
            // This logic needs to change slightly to filter IDs
            store.update(s => {
                let updatedChannels = s.availableChannels;
                if (message) {
                    const msgTime = message.timestamp.getTime() / 1000;
                    updatedChannels = s.availableChannels.map(c => {
                        if (c.id === channel.id) {
                            const current = c.lastReadAt || 0;
                            return { ...c, lastReadAt: Math.max(current, msgTime) };
                        }
                        return c;
                    });
                }
                
                // const newUnread = { ...s.unread };
                // delete newUnread[channel.id];

                // PURGE Triage/Inbox
                // We must lookup the messages to check timestamps
                const filterIdList = (bufferId: string) => {
                    const buf = workspace.getBuffer(bufferId);
                    if (!buf) return;
                    
                    const newIds = buf.messageIds.filter(id => {
                        const m = s.entities.messages.get(id);
                        if (!m) return false; // Purge ghost IDs
        
                        const msgChannelId = m.sourceChannel?.id || channel.id;
                        const msgThreadId = m.threadId ? `thread_${m.threadId}` : null;

                        // --- DUAL READ LOGIC ---
                         
                        // 1. If we are reading a specific THREAD
                        if (channel.isThread) {
                            // Only purge messages belonging to THIS thread
                            if (msgThreadId !== channel.id) return true; // Keep others
                            if (message) return m.timestamp.getTime() > message.timestamp.getTime();
                            return false; 
                        }
                        
                        // 2. If we are reading a CHANNEL
                        else {
                            // Only purge messages belonging to THIS channel (roots)
                            if (msgChannelId !== channel.id) return true; 
                            
                            // CRITICAL: Do NOT purge thread replies that appear in Triage/Inbox
                            // when reading the main channel. They have their own lifecycle.
                            if (m.threadId) return true; 

                            if (message) return m.timestamp.getTime() > message.timestamp.getTime();
                            return false;
                        }
                    });
                    
                    if (buf.messageIds.length !== newIds.length) {
                        buf.messageIds = newIds;
                    }
                };
                
                filterIdList('triage');
                filterIdList('inbox');
                
                // Force sync to update virtual counts
                const nextState = { ...s, availableChannels: updatedChannels};
                return updateVirtualCounts(nextState);
            });
            
            // Explicitly sync to refresh UI if we are looking at Triage/Inbox
            syncState();
        },

        isMyMessage: (msg: Message) => {
            const state = get(store);
            if (!state.currentUser) return false;
            return msg.author.id === state.currentUser.id;
        }
    };
}

export const chatStore = createChatStore();
