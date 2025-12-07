import { writable, get } from 'svelte/store';
import { Workspace } from '../logic/Workspace';
import type { ChannelIdentity, Message, UnreadState, UserIdentity } from '../logic/types';

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
}

function createChatStore() {
    const workspace = new Workspace();
    
    const systemChannel: ChannelIdentity = {
        id: 'system',
        name: 'system',
        service: { id: 'internal', name: 'Solaria' }
    };

    const store = writable<ChatState>({
        activeChannel: systemChannel,
        availableChannels: [systemChannel],
        messages: [],
        cursorIndex: -1,
        isAttached: true,
        unread: {},
        identities: {},
        currentUser: null,
        users: new Map(),
    });

    workspace.openChannel(systemChannel);
    workspace.activeChannel = systemChannel;

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
            workspace.dispatchMessage(channel, msg);
            
            store.update(s => {
                // 1. NEW: Update the Channel's Gravity (lastPostAt)
                // We map over the array to ensure Svelte detects the change
                const updatedChannels = s.availableChannels.map(c => {
                    if (c.id === channel.id) {
                        return { 
                            ...c, 
                            // Convert JS Date (ms) to Unix Timestamp (seconds) to match Backend format
                            lastPostAt: msg.timestamp.getTime() / 1000 
                        };
                    }
                    return c;
                });

                // 2. Unread Logic (Existing)
                let newUnread = s.unread;
                if (channel.id !== s.activeChannel.id) {
                    const current = s.unread[channel.id] || { count: 0, hasMention: false };
                    
                    let isMention = false;
                    if (s.currentUser) {
                         isMention = msg.content.includes(`@${s.currentUser.name}`) || 
                                     msg.content.includes(`@${s.currentUser.id}`);
                    }

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
                    unread: newUnread
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

        switchChannel: (channel: ChannelIdentity) => {
            if (!channel) return;
            
            store.update(s => {
                const newUnread = { ...s.unread };
                
                // Lookup the identity for this channel's service
                const serviceIdentity = s.identities[channel.service.id] || null;

                return { 
                    ...s, 
                    currentUser: serviceIdentity // <--- Context Switch
                };
            });
            workspace.openChannel(channel);
            // --- NEW: FORCE DETACH ---
            // We assume "detached" until the UI proves we are at the bottom.
            // This prevents checkReadStatus() from firing prematurely.
            workspace.getActiveWindow().isAttached = false;
            
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
        
        isMyMessage: (msg: Message) => {
            const state = get(store);
            if (!state.currentUser) return false;
            return msg.author.id === state.currentUser.id;
        }
    };
}

export const chatStore = createChatStore();
