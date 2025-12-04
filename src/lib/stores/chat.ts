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
    currentUser: UserIdentity | null;
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
        currentUser: null
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

    // setupActiveBufferListener();
    // syncState();

    return {
        subscribe: store.subscribe,
        
        dispatchMessage: (channel: ChannelIdentity, msg: Message) => {
            workspace.dispatchMessage(channel, msg);
            store.update(s => {
                // Unread Logic
                if (channel.id !== s.activeChannel.id) {
                    const current = s.unread[channel.id] || { count: 0, hasMention: false };
                    
                    let isMention = false;
                    if (s.currentUser) {
                         // Check against name and ID
                         isMention = msg.content.includes(`@${s.currentUser.name}`) || 
                                     msg.content.includes(`@${s.currentUser.id}`);
                    }

                    return {
                        ...s,
                        unread: {
                            ...s.unread,
                            [channel.id]: {
                                count: current.count + 1,
                                hasMention: current.hasMention || isMention
                            }
                        }
                    };
                }
                return s;
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
        // handleReaction: (channelId: string, msgId: string, emoji: string, userId: string, action: 'add' | 'remove') => {
        //     // 1. We need to find the message in the workspace buffers
        //     // Since `Workspace` doesn't expose getBuffer by ID easily, we cheat slightly:
        //     // We assume the user is likely looking at the channel, or we find it if open.
        //
        //     // TODO: Expose `workspace.windows.get(channelId)` properly.
        //     // For now, let's assume we primarily update the ACTIVE buffer to reflect UI immediately.
        //     const currentId = get(store).activeChannel.id;
        //
        //     if (channelId === currentId || !channelId) {
        //         const buffer = workspace.getActiveBuffer();
        //         const msg = buffer.messages.find(m => m.id === msgId);
        //
        //         if (msg) {
        //             if (!msg.reactions) msg.reactions = {};
        //             let users = msg.reactions[emoji] || [];
        //
        //             if (action === 'add') {
        //                 if (!users.includes(userId)) users.push(userId);
        //             } else {
        //                 users = users.filter(u => u !== userId);
        //             }
        //
        //             if (users.length > 0) {
        //                 msg.reactions[emoji] = users;
        //             } else {
        //                 delete msg.reactions[emoji];
        //             }
        //
        //             // Trigger Svelte update
        //             syncState();
        //         }
        //     }
        // },

        moveCursor: (delta: number) => {
            workspace.getActiveWindow().moveCursor(delta);
            syncState(); 
        },

        jumpToBottom: () => {
            workspace.getActiveWindow().jumpToBottom();
            syncState();
        },

        switchChannel: (channel: ChannelIdentity) => {
            if (!channel) return;
            
            // CLEAR UNREADS ON SWITCH
            store.update(s => {
                const newUnread = { ...s.unread };
                delete newUnread[channel.id];
                return { ...s, unread: newUnread };
            });

            workspace.openChannel(channel);
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
            buffer.messages = buffer.messages.filter(m => m.id !== id);
            syncState();
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

        setIdentity: (user: { id: string; name: string }) => {
            store.update(s => ({ ...s, currentUser: user }));
        },
        
        isMyMessage: (msg: Message) => {
            const state = get(store);
            if (!state.currentUser) return false;
            return msg.author.id === state.currentUser.id;
        }
    };
}

export const chatStore = createChatStore();
