// src/lib/logic/Workspace.ts
import { ChatBuffer } from './ChatBuffer';
import { ChatWindow } from './ChatWindow';
import type { ChannelIdentity } from './types';

type Listener = () => void;

export class Workspace {
    private windows: Map<string, ChatWindow> = new Map();
    private meta: Map<string, ChannelIdentity> = new Map();
    private readonly MAX_HISTORY = 50;

    // We still track the Active Channel Object for metadata purposes
    activeChannel: ChannelIdentity;
    private navigationStack: ChannelIdentity[] = [];
    
    private listeners: Listener[] = [];

    constructor() {
        const systemIdentity: ChannelIdentity = {
            id: 'system',
            name: 'System',
            service: { id: 'internal', name: 'Solaria' }
        };
        this.ensureChannelExists(systemIdentity);
        this.activeChannel = systemIdentity;
    }

    private ensureChannelExists(identity: ChannelIdentity): boolean {
        let isNew = false;
        const { id } = identity;

        if (!this.windows.has(id)) {
            const buffer = new ChatBuffer();
            const window = new ChatWindow(buffer);
            this.windows.set(id, window);
            isNew = true;
        }

        const existing = this.meta.get(id);
        if (!existing) {
            this.meta.set(id, identity);
        } else {
            this.meta.set(id, {
                ...existing,
                ...identity,
                parentChannel: identity.parentChannel || existing.parentChannel,
                threadId: identity.threadId || existing.threadId,
                parentMessage: identity.parentMessage || existing.parentMessage,
                isThread: identity.isThread || existing.isThread
            });
        }

        return isNew;
    }

    openChannel(identity: ChannelIdentity) {
        if (!identity || !identity.id) {
            console.error("Workspace: Invalid identity passed to openChannel", identity);
            return;
        }

        const isNew = this.ensureChannelExists(identity);
        if (this.activeChannel.id !== identity.id) {
            this.activeChannel = identity;
            this.notify();
        }
    }

    openThread(parentMsgId: string, parentChannel: ChannelIdentity, parentMsgObject: any) {
        const threadInternalId = `thread_${parentMsgId}`;
        const service = parentChannel.service;

        this.navigationStack.push(this.activeChannel);

        const threadIdentity: ChannelIdentity = {
            id: threadInternalId,
            name: 'Thread',
            service: service,
            isThread: true,
            parentChannel: parentChannel,
            threadId: parentMsgId,
            parentMessage: parentMsgObject // We still need this for the Banner, for now.
        };

        this.openChannel(threadIdentity);
    }

    reset() {
        this.windows.clear();
        this.meta.clear();
        this.navigationStack = [];
        // Re-bootstrap system
        const systemIdentity: ChannelIdentity = {
            id: 'system',
            name: 'System',
            service: { id: 'internal', name: 'Solaria' }
        };
        this.ensureChannelExists(systemIdentity);
        this.activeChannel = systemIdentity;
    }

    goBack() {
        const prev = this.navigationStack.pop();
        if (prev) {
            this.activeChannel = prev;
            this.notify();
        }
    }

    // CHANGED: Now takes an ID string, not a Message object
    dispatchMessageId(channel: ChannelIdentity, msgId: string) {
        const isNew = this.ensureChannelExists(channel);
        const window = this.windows.get(channel.id);
        
        // Push the ID
        window?.buffer.addMessageId(msgId);
        
        if (isNew) this.notify();
    }
    
    getChannelList(): ChannelIdentity[] {
        return Array.from(this.meta.values());
    }
    
    getActiveWindow(): ChatWindow { 
        return this.windows.get(this.activeChannel.id)!;
    }

    getActiveBuffer(): ChatBuffer { return this.getActiveWindow().buffer; }
    
    getBuffer(id: string): ChatBuffer | undefined { return this.windows.get(id)?.buffer; }

    getLastMessageId(channel: ChannelIdentity): string | undefined {
        const window = this.windows.get(channel.id);
        if (!window) return undefined;
        
        const ids = window.buffer.messageIds;
        if (ids.length === 0) return undefined;
        
        return ids[ids.length - 1];
    }

    subscribe(fn: Listener) {
        this.listeners.push(fn);
        return () => { this.listeners = this.listeners.filter(l => l !== fn); };
    }
    
    private notify() { this.listeners.forEach(fn => fn()); }

    pushToHistory(channel: ChannelIdentity) {
        const top = this.navigationStack[this.navigationStack.length - 1];
        if (top && top.id === channel.id) return;

        this.navigationStack.push(channel);
        if (this.navigationStack.length > this.MAX_HISTORY) {
            this.navigationStack.shift();
        }
    }
}
