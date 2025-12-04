import { writable, get } from 'svelte/store';
import { Workspace } from '../logic/Workspace';
import type { ChannelIdentity, Message } from '../logic/types';

interface ChatState {
    activeChannel: ChannelIdentity;
    availableChannels: ChannelIdentity[];
    messages: Message[];
    cursorIndex: number;
    isAttached: boolean;
}

function createChatStore() {
    const workspace = new Workspace();

    // Define Initial Channels
    const systemChannel: ChannelIdentity = {
        id: 'system',
        name: 'system',
        service: { id: 'internal', name: 'Solaria' }
    };

    // Initialize Store
    const store = writable<ChatState>({
        // CHANGED: Default to system for introspection
        activeChannel: systemChannel, 
        
        availableChannels: [systemChannel], 
        messages: [],
        cursorIndex: -1,
        isAttached: true
    });

    // Ensure Workspace tracks them
    workspace.openChannel(systemChannel);
    
    // Set the workspace active channel to match the store default
    workspace.activeChannel = systemChannel;

    let activeBufferUnsubscribe: (() => void) | null = null;

    const syncState = () => {
        const win = workspace.getActiveWindow();
        const buf = workspace.getActiveBuffer();
        
        if (!workspace.activeChannel) return; 

        store.update(s => ({
            ...s, 
            
            // Sync these from Workspace
            activeChannel: workspace.activeChannel,
            messages: buf.messages,
            cursorIndex: win.cursorIndex,
            isAttached: win.isAttached,
            
            // DO NOT OVERWRITE availableChannels with workspace.getChannelList()
            // The Workspace only knows about OPEN tabs. The Store knows about the WORLD.
        }));
    };

    workspace.subscribe(() => {
        setupActiveBufferListener();
        syncState();
    });

    function setupActiveBufferListener() {
        if (activeBufferUnsubscribe) {
            activeBufferUnsubscribe();
        }
        activeBufferUnsubscribe = workspace.getActiveBuffer().subscribe(() => {
            syncState();
        });
    }

    // Initialize listener
    setupActiveBufferListener();
    syncState();

    return {
        subscribe: store.subscribe,
        
        dispatchMessage: (channel: ChannelIdentity, msg: Message) => {
            workspace.dispatchMessage(channel, msg);
        },
        
        moveCursor: (delta: number) => {
            workspace.getActiveWindow().moveCursor(delta);
            syncState(); 
        },

        jumpToBottom: () => {
            workspace.getActiveWindow().jumpToBottom();
            syncState();
        },

        switchChannel: (channel: ChannelIdentity) => {
            if (!channel) {
                console.error("Store: switchChannel called with null/undefined");
                return;
            }
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
                    // Merge logic similar to workspace
                    if (existing) {
                        channelMap.set(ch.id, { ...existing, ...ch });
                    } else {
                        channelMap.set(ch.id, ch);
                    }
                }
                return { ...s, availableChannels: Array.from(channelMap.values()) };
            });
        }
    };
}

export const chatStore = createChatStore();
