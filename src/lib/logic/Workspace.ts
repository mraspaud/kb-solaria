import { ChatBuffer } from './ChatBuffer';
import { ChatWindow } from './ChatWindow';
import type { ChannelIdentity, Message } from './types';

type Listener = () => void;

export class Workspace {
    private windows: Map<string, ChatWindow> = new Map();
    // Map ChannelID -> ChannelIdentity Object
    private meta: Map<string, ChannelIdentity> = new Map();
    
    activeChannelId: string = 'general';
    private listeners: Listener[] = [];

    constructor() {
        // Initialize default
        this.ensureChannelExists({
            id: 'general',
            name: 'general',
            service: { id: 'sys', name: 'System' }
        });
    }

    // Now takes a structured object
    private ensureChannelExists(identity: ChannelIdentity): boolean {
        let isNew = false;
        const { id, name, service } = identity;

        // 1. Create Buffer/Window if missing
        if (!this.windows.has(id)) {
            const buffer = new ChatBuffer();
            const window = new ChatWindow(buffer);
            this.windows.set(id, window);
            isNew = true;
        }

        // 2. Update Metadata
        const existing = this.meta.get(id);
        
        // Update if new, or if name/service details changed
        if (!existing || existing.name !== name || existing.service.name !== service.name) {
            this.meta.set(id, identity);
        }

        return isNew;
    }

    openChannel(identity: ChannelIdentity) {
        const isNew = this.ensureChannelExists(identity);
        
        if (this.activeChannelId !== identity.id || isNew) {
            this.activeChannelId = identity.id;
            this.notify();
        }
    }

    // Helper for UI to open by ID only (if they don't have full object handy)
    // We try to find existing metadata
    openChannelById(channelId: string) {
        const meta = this.meta.get(channelId);
        if (meta) {
            this.openChannel(meta);
        } else {
            console.warn(`Attempted to open unknown channel ${channelId}`);
        }
    }

    dispatchMessage(channel: ChannelIdentity, msg: Message) {
        const isNew = this.ensureChannelExists(channel);
        
        const window = this.windows.get(channel.id);
        window?.buffer.addMessage(msg);

        if (isNew) this.notify();
    }
    
    // Returns full objects now
    getChannelList(): ChannelIdentity[] {
        return Array.from(this.meta.values());
    }
    
    // ... Getters & Subscribe (Unchanged) ...
    getActiveWindow(): ChatWindow { return this.windows.get(this.activeChannelId)!; }
    getActiveBuffer(): ChatBuffer { return this.getActiveWindow().buffer; }
    getBuffer(channelId: string): ChatBuffer | undefined { return this.windows.get(channelId)?.buffer; }
    
    subscribe(fn: Listener) {
        this.listeners.push(fn);
        return () => { this.listeners = this.listeners.filter(l => l !== fn); };
    }
    private notify() { this.listeners.forEach(fn => fn()); }
}
