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
        participatedThreads: new Set()
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

        store.update(s => ({
            ...s, 
            activeChannel: workspace.activeChannel,
            messages: buf.messages,
            cursorIndex: win.cursorIndex,
            isAttached: win.isAttached,
        }));
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
                if (myIdentity && msg.author.id === myIdentity.id) {
                    // ...and it's a thread...
                    if (msg.threadId) {
                        myThreads.add(msg.threadId);
                        // console.log(`[Memory] Tracking thread ${msg.threadId}`);
                    }
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

                if (verdict === Bucket.EGO || verdict === Bucket.CONTEXT) {
                    // Route to #triage
                    workspace.dispatchMessage(triageChannel, clone);
                    // Force notification/sound for Ego?
                } else if (verdict === Bucket.SIGNAL) {
                    // Route to #inbox
                    workspace.dispatchMessage(inboxChannel, clone);
                }

                // --- D. STORE UPDATES (Existing Logic) ---
                // Update Gravity
                const updatedChannels = s.availableChannels.map(c => {
                    if (c.id === channel.id) {
                        return { ...c, lastPostAt: msg.timestamp.getTime() / 1000 };
                    }
                    return c;
                });

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

                return {
                    ...s,
                    availableChannels: updatedChannels,
                    unread: newUnread,
                    participatedThreads: myThreads // Save updated memory
                };
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
            
            // --- NEW: Jump Logic ---
            if (targetMessageId) {
                const buf = workspace.getActiveBuffer();
                const idx = buf.messages.findIndex(m => m.id === targetMessageId);
                
                if (idx !== -1) {
                    // Found it! Jump to it and detach.
                    win.cursorIndex = idx;
                    win.isAttached = false;
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
            workspace.openThread(msg, currentChan);
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

        // NEW: Consolidated Read Logic
        markChannelAsRead: (channel: ChannelIdentity, messageId: string) => {
            // 1. Optimistic Store Update
            store.update(s => {
                // A. Clear Unread Count
                const newUnread = { ...s.unread };
                if (newUnread[channel.id]) {
                    delete newUnread[channel.id];
                }

                // B. PURGE TRIAGE & INBOX
                // We access the raw buffers directly for the virtual channels
                const triageBuf = workspace.getBuffer('triage');
                const inboxBuf = workspace.getBuffer('inbox');

                const filterFn = (m: Message) => {
                    // Keep the message IF:
                    // 1. It has no source (system msg)
                    // 2. OR It comes from a DIFFERENT channel
                    // 3. OR It comes from THIS channel but is NEWER than what we just read
                    //    (Simple string comparison works for KSUIDs/TSIDs, 
                    //     but strictly we might want timestamp comparison if IDs aren't chronological.
                    //     For now, assume if we hit bottom, we read everything.)
                    return !m.sourceChannel || m.sourceChannel.id !== channel.id;
                };

                if (triageBuf) triageBuf.messages = triageBuf.messages.filter(filterFn);
                if (inboxBuf) inboxBuf.messages = inboxBuf.messages.filter(filterFn);

                // C. Force a UI Sync if we are currently looking at Triage/Inbox
                // (This ensures the message disappears instantly from your eyes)
                if (s.activeChannel.service.id === 'aggregation') {
                    const win = workspace.getActiveWindow();
                    // Re-sync the store's message list with the modified buffer
                    return { ...s, unread: newUnread, messages: [...workspace.getActiveBuffer().messages] };
                }

                try {
                    const blacklist = JSON.parse(localStorage.getItem('solaria_read_state') || '{}');
                    blacklist[channel.id] = messageId;
                    localStorage.setItem('solaria_read_state', JSON.stringify(blacklist));
                } catch (e) { console.error("Storage error", e); }

                return { ...s, unread: newUnread };
            });

            // 2. Network Side Effect (The existing logic)
            // We verify the service exists to avoid errors on virtual channels
            if (channel.service.id !== 'internal' && channel.service.id !== 'aggregation') {
                 // Import this at top of file or pass it in if circular dependency is an issue.
                 // Ideally, keep `sendMarkRead` import in socketStore and call it here,
                 // BUT `chatStore` shouldn't depend on `socketStore` (circular).
                 // 
                 // SOLUTION: We will trigger the socket call from the Component (App.svelte),
                 // or move `markChannelAsRead` to a controller file.
                 //
                 // For now, let's keep the socket call in App.svelte for architecture safety,
                 // and use this function purely for LOCAL state management.
            }
        },

        isMyMessage: (msg: Message) => {
            const state = get(store);
            if (!state.currentUser) return false;
            return msg.author.id === state.currentUser.id;
        }

    };
}

export const chatStore = createChatStore();
