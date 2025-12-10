import { writable, get } from 'svelte/store';
import { Workspace } from '../logic/Workspace';
import { BucketAnalyzer } from '../logic/BucketAnalyzer';
import { type ChannelIdentity, type Message, type UnreadState, type UserIdentity, Bucket } from '../logic/types';

interface ChatState {
    activeChannel: ChannelIdentity;
    availableChannels: ChannelIdentity[];
    messages: Message[];
    cursorIndex: number;
    isAttached: boolean;
    unread: Record<string, UnreadState>;
    identities: Record<string, UserIdentity>;
    currentUser: UserIdentity | null;
    users: Map<string, UserIdentity>;
    participatedThreads: Set<string>;
    virtualCounts: { triage: number; inbox: number; };
}

function createChatStore() {
    const workspace = new Workspace();

    // 1. Define Virtual Channels
    const triageChannel: ChannelIdentity = {
        id: 'triage',
        name: 'triage',
        service: { id: 'aggregation', name: 'Solaria' } // Virtual Service
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

    workspace.openChannel(triageChannel);
    workspace.openChannel(inboxChannel);
    workspace.openChannel(systemChannel);
    workspace.activeChannel = triageChannel;

    let activeBufferUnsubscribe: (() => void) | null = null;

    const syncState = () => {
        const win = workspace.getActiveWindow();
        const buf = workspace.getActiveBuffer();
        
        if (!workspace.activeChannel) return; 

        store.update(s => {
            // OPTIMIZATION: Referential Equality Check
            // The buffer is mutable, but our store state is immutable.
            // We only want to clone the buffer into a new array if the CONTENT has changed.
            // Since ChatBuffer replaces objects on update (see ChatBuffer.ts:516), 
            // strictly comparing the items is safe.
            
            let messagesToUse = s.messages;
            const source = buf.messages;

            // 1. Length Check (Fastest)
            let hasChanged = source.length !== messagesToUse.length;

            // 2. Content Check (O(N) - only if length matched)
            if (!hasChanged) {
                // We iterate backwards because changes (new messages) usually happen at the end.
                for (let i = source.length - 1; i >= 0; i--) {
                    if (source[i] !== messagesToUse[i]) {
                        hasChanged = true;
                        break;
                    }
                }
            }

            if (hasChanged) {
                messagesToUse = [...source];
            }

            return {
                ...s, 
                activeChannel: workspace.activeChannel,
                messages: messagesToUse, // Reuses the old array if identical
                cursorIndex: win.cursorIndex,
                isAttached: win.isAttached,
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
                triage: triageBuf ? triageBuf.messages.length : 0,
                inbox: inboxBuf ? inboxBuf.messages.length : 0
            }
        };
    };

    return {
        subscribe: store.subscribe,
        
        dispatchMessage: (channel: ChannelIdentity, msg: Message) => {
            store.update(s => {
                // --- A. MEMORY UPDATE (Bootstrapping) ---
                // We do this BEFORE routing logic.
                // We need the identity for THIS channel's service.
                const myIdentity = s.identities[channel.service.id];
                const myThreads = s.participatedThreads;

                // If I am the author...
                if (myIdentity && msg.author.id === myIdentity.id && msg.threadId) {
                    myThreads.add(msg.threadId);
                }
                
                // --- B. THE BRAIN (Classification) ---
                const verdict = BucketAnalyzer.classify(msg, channel, myIdentity, myThreads);
                msg.bucket = verdict; // Tag the message

                // --- C. ROUTING (The Pipes - Provisional) ---
                // We dispatch to the REAL channel first (The Noise Layer)
                workspace.dispatchMessage(channel, msg);

                // Now route clones to Virtual Channels based on verdict
                // (We clone to prevent reference issues if we edit content later)
                const clone = { 
                    ...msg,
                    sourceChannel: channel
                };

                let routedToTriage = false;
                let routedToInbox = false;

                if (verdict === Bucket.EGO || verdict === Bucket.CONTEXT) {
                    // Route to #triage
                    workspace.dispatchMessage(triageChannel, clone);
                    routedToTriage = true;
                    // Force notification/sound for Ego?
                } else if (verdict === Bucket.SIGNAL) {
                    // Route to #inbox
                    workspace.dispatchMessage(inboxChannel, clone);
                    routedToInbox = true;
                }

                // --- D. STORE UPDATES (Existing Logic) ---
                // Update Gravity
                let channelExists = false;
                const updatedChannels = s.availableChannels.map(c => {
                    if (c.id === channel.id) {
                        channelExists = true;
                        return { ...c, lastPostAt: msg.timestamp.getTime() / 1000 };
                    }
                    return c;
                });
                if (!channelExists) {
                    updatedChannels.push({
                        ...channel,
                        lastPostAt: msg.timestamp.getTime() / 1000
                    });
                }
                // 2. Unread Logic (Existing)
                let newUnread = s.unread;
                if (channel.id !== s.activeChannel.id) {
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
                    availableChannels: updatedChannels, // derived from your existing logic
                    unread: newUnread,                  // derived from your existing logic
                    participatedThreads: myThreads      // derived from your existing logic
                };

                const currentId = s.activeChannel.id;
                const affectedActive = 
                    (channel.id === currentId) || 
                    (routedToTriage && currentId === 'triage') ||
                    (routedToInbox && currentId === 'inbox');

                if (affectedActive) {
                    // We need to return the new state WITH the new messages.
                    // Since 'workspace' has the data, we pull it directly.
                    const win = workspace.getActiveWindow();
                    return {
                        ...s,
                        // ... existing updates (unread, channels) ...
                        availableChannels: updatedChannels,
                        unread: newUnread,
                        participatedThreads: myThreads,
                        // FORCE REFRESH MESSAGES
                        messages: [...win.buffer.messages],
                        isAttached: win.isAttached,
                        cursorIndex: win.cursorIndex
                    };
                }

                
                // FINAL SYNC of counts
                return updateVirtualCounts(nextState);
            });
        },

        handleReaction: (channelId: string, msgId: string, emoji: string, userId: string, action: 'add' | 'remove') => {
             const buf = workspace.getActiveBuffer(); 
             const msg = buf.messages.find(m => m.id === msgId);
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
                syncState();
             }
        },

        moveCursor: (delta: number) => {
            workspace.getActiveWindow().moveCursor(delta);
            syncState(); 
        },

        jumpTo: (index: number) => {
            const win = workspace.getActiveWindow();
            const max = workspace.getActiveBuffer().messages.length - 1;
            
            // Set position clamped to bounds
            win.cursorIndex = Math.max(0, Math.min(index, max));
            
            // DETACH unless we explicitly jumped to the very end
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
                const idx = buf.messages.findIndex(m => m.id === targetMessageId);
                
                if (idx !== -1) {
                    // Found it! Jump to it and detach.
                    win.cursorIndex = idx;
                    win.isAttached = (idx >= buf.messages.length - 1);
                } else {
                    // Fallback: If not found (rare, given hydration), go to bottom
                    win.isAttached = true; 
                    win.cursorIndex = buf.messages.length - 1;
                }
            } else {
                 // Default behavior (Detach at bottom to prevent auto-read triggering)
                 win.isAttached = false;
            }
            // -----------------------
            
            syncState();
        },

        openThread: (msg: Message) => {
            const currentChan = workspace.activeChannel;
            
            const contextChannel = (currentChan.service.id === 'aggregation' && msg.sourceChannel) 
                ? msg.sourceChannel 
                : currentChan;

            workspace.openThread(msg, contextChannel);
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
            const buffer = workspace.getActiveBuffer();
            const msg = buffer.messages.find(m => m.id === id);
            if (msg) {
                msg.content = newContent;
            }
            syncState();
        },

        removeMessage: (id: string) => {
            const buffer = workspace.getActiveBuffer();
            const win = workspace.getActiveWindow();
            buffer.messages = buffer.messages.filter(m => m.id !== id);
            const maxIndex = buffer.messages.length - 1;

            if (win.cursorIndex > maxIndex) {
                win.cursorIndex = maxIndex;
            }
            
            if (maxIndex < 0) {
                win.cursorIndex = -1;
            }

            win.isAttached = (win.cursorIndex === maxIndex);
            syncState();
        },

        getLastMessageId: (channel: ChannelIdentity): string | undefined => {
             return workspace.getLastMessageId(channel);
        },

        upsertChannels: (newChannels: ChannelIdentity[]) => {
            store.update(s => {
                const currentChannels = s.availableChannels || [];
                const channelMap = new Map(currentChannels.map(c => [c.id, c]));
                
                for (const ch of newChannels) {
                    const existing = channelMap.get(ch.id);
                    if (existing) {
                        channelMap.set(ch.id, { ...existing, ...ch });
                    } else {
                        channelMap.set(ch.id, ch);
                    }
                }
                return { ...s, availableChannels: Array.from(channelMap.values()) };
            });
        },

        upsertUsers: (newUsers: UserIdentity[]) => {
            store.update(s => {
                const updated = new Map(s.users);
                newUsers.forEach(u => updated.set(u.id, u));
                
                // Ensure Current User is in the list
                if (s.currentUser && !updated.has(s.currentUser.id)) {
                    updated.set(s.currentUser.id, s.currentUser);
                }
                
                return { ...s, users: updated };
            });
        },

        setIdentity: (serviceId: string, user: UserIdentity) => {
            store.update(s => {
                // Ensure the user object has the serviceId attached
                const userWithService = { ...user, serviceId };

                const newIdentities = { ...s.identities, [serviceId]: userWithService };
                
                let newCurrent = s.currentUser;
                if (s.activeChannel.service.id === serviceId) {
                    newCurrent = userWithService;
                }
                
                // Add 'Me' to the phonebook with the correct Service ID tag
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
                
                // We accept the backend's truth, but if we already have local state, 
                // we merge strictly (taking the max) to avoid clearing local updates.
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
            store.update(s => {
                // 1. UPDATE HIGH WATER MARK
                // If we have a specific message, update the channel's lastReadAt
                let updatedChannels = s.availableChannels;
                
                if (message) {
                    const msgTime = message.timestamp.getTime() / 1000;
                    updatedChannels = s.availableChannels.map(c => {
                        if (c.id === channel.id) {
                            // Only advance, never retreat
                            const current = c.lastReadAt || 0;
                            return { ...c, lastReadAt: Math.max(current, msgTime) };
                        }
                        return c;
                    });
                }

                // 2. DO NOT DELETE UNREAD STATE
                // We used to do: delete newUnread[channel.id]; 
                // We removed that. The backend will send a 'channel_list' or update event
                // with the new count (e.g. 5 -> 4) eventually. 
                
                // 3. PURGE TRIAGE & INBOX (Existing Logic)
                const triageBuf = workspace.getBuffer('triage');
                const inboxBuf = workspace.getBuffer('inbox');

                // Filter out messages from this channel that are OLDER or EQUAL to the one we just read.
                const filterFn = (m: Message) => {
                    // Keep if:
                    // 1. Different channel
                    if (!m.sourceChannel || m.sourceChannel.id !== channel.id) return true;
                    
                    // 2. Same channel, but NEWER than the one we read
                    // If we passed a message, filter. If null (mark all), filter everything.
                    if (message) {
                        return m.timestamp.getTime() > message.timestamp.getTime();
                    }
                    return false; // Mark all read -> remove all
                };

                if (triageBuf) triageBuf.messages = triageBuf.messages.filter(filterFn);
                if (inboxBuf) inboxBuf.messages = inboxBuf.messages.filter(filterFn);

                const nextState = { 
                    ...s, 
                    availableChannels: updatedChannels 
                };

                // 4. Force UI Sync if active
                if (s.activeChannel.service.id === 'aggregation') {
                    return { 
                        ...updateVirtualCounts(nextState), 
                        messages: [...workspace.getActiveBuffer().messages] 
                    };
                }

                return updateVirtualCounts(nextState);
            });
        },

        isMyMessage: (msg: Message) => {
            const state = get(store);
            if (!state.currentUser) return false;
            return msg.author.id === state.currentUser.id;
        }

    };
}

export const chatStore = createChatStore();
