import { writable } from 'svelte/store';
import { Workspace } from '../logic/Workspace';
import type { ChannelIdentity, Message } from '../logic/types';

interface ChatState {
    activeChannelId: string;
    availableChannels: ChannelIdentity[];
    messages: Message[];
    cursorIndex: number;
    isAttached: boolean;
}

function createChatStore() {
    // 1. Instantiate the Engine
    const workspace = new Workspace();

    // 2. Create the Svelte Store
    const store = writable<ChatState>({
        activeChannelId: 'general',
        availableChannels: [{ 
            id: 'general', 
            name: 'general', 
            service: { id: 'sys', name: 'System' } 
        }], 
        messages: [],
        cursorIndex: -1,
        isAttached: true
    });

    let activeBufferUnsubscribe: (() => void) | null = null;

    const syncState = () => {
        const win = workspace.getActiveWindow();
        const buf = workspace.getActiveBuffer();

        store.set({
            activeChannelId: workspace.activeChannelId,
            availableChannels: workspace.getChannelList(),
            messages: buf.messages,
            cursorIndex: win.cursorIndex,
            isAttached: win.isAttached
        });
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

    // Initialize
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

        switchChannel: (channelId: string) => {
            workspace.openChannelById(channelId);
        },

        detach: () => {
            workspace.detach();
            syncState();
        }
    };
}

export const chatStore = createChatStore();
