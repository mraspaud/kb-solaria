import { ChatBuffer } from './ChatBuffer';
import { ChatWindow } from './ChatWindow';
import type { ChannelIdentity, Message, ServiceIdentity } from './types';

type Listener = () => void;

export class Workspace {
    private windows: Map<string, ChatWindow> = new Map();
    private meta: Map<string, ChannelIdentity> = new Map();
    private readonly MAX_HISTORY = 50;
    
    // STRICT: activeChannel is always an Object
    activeChannel: ChannelIdentity;
    
    // STRICT: Navigation stack holds Objects
    private navigationStack: ChannelIdentity[] = [];
    
    private listeners: Listener[] = [];

    constructor() {
        // Create the System Identity Object
        const systemIdentity: ChannelIdentity = {
            id: 'system',
            name: 'System',
            service: { id: 'internal', name: 'Solaria' }
        };

        // Bootstrap
        this.ensureChannelExists(systemIdentity);
        this.activeChannel = systemIdentity;
    }

    // This method is the "Gateway" that ensures an Object is tracked
    private ensureChannelExists(identity: ChannelIdentity): boolean {
        let isNew = false;
        const { id } = identity;

        // 1. Create Window infrastructure if missing
        if (!this.windows.has(id)) {
            const buffer = new ChatBuffer();
            const window = new ChatWindow(buffer);
            this.windows.set(id, window);
            isNew = true;
        }

        // 2. Update/Merge Metadata
        const existing = this.meta.get(id);
        
        if (!existing) {
            this.meta.set(id, identity);
        } else {
            // When merging, we prefer the NEW identity, but keep OLD context
            // if the new one is "shallow" (e.g. created from a socket event)
            this.meta.set(id, {
                ...existing,
                ...identity, // Overwrite name/service updates
                // Preserve structural context
                parentChannel: identity.parentChannel || existing.parentChannel,
                threadId: identity.threadId || existing.threadId,
                parentMessage: identity.parentMessage || existing.parentMessage,
                isThread: identity.isThread || existing.isThread
            });
        }

        return isNew;
    }

    // STRICT: Only accepts Object. No strings allowed.
    openChannel(identity: ChannelIdentity) {
        if (!identity || !identity.id) {
            console.error("Workspace: Invalid identity passed to openChannel", identity);
            return;
        }

        const isNew = this.ensureChannelExists(identity);

        // Update Active Channel
        // We use ID comparison, but store the Object
        if (this.activeChannel.id !== identity.id) {
            this.activeChannel = identity;
            this.notify();
        }
    }

    // --- THREADING ---
    openThread(parentMsg: Message, parentChannel: ChannelIdentity) {
        const threadInternalId = `thread_${parentMsg.id}`;
        
        // We need the service info from the parent
        const service = parentChannel.service;

        this.navigationStack.push(this.activeChannel);

        // Construct the Thread Identity Object
        const threadIdentity: ChannelIdentity = {
            id: threadInternalId,
            name: 'Thread',
            service: service,
            isThread: true,
            parentChannel: parentChannel, // Pass the OBJECT
            threadId: parentMsg.id,
            parentMessage: parentMsg
        };

        // Reuse openChannel logic
        this.openChannel(threadIdentity);
    }

    goBack() {
        const prev = this.navigationStack.pop();
        if (prev) {
            // We already have the object, so just switch
            this.activeChannel = prev;
            this.notify();
        }
    }

    // --- MESSAGING ---
    dispatchMessage(channel: ChannelIdentity, msg: Message) {
        const isNew = this.ensureChannelExists(channel);
        
        // Use ID for internal map lookup only
        const window = this.windows.get(channel.id);
        window?.buffer.addMessage(msg);
        
        if (isNew) this.notify();
    }
    
    getChannelList(): ChannelIdentity[] {
        return Array.from(this.meta.values());
    }
    
    getActiveWindow(): ChatWindow { 
        // Safe lookup using the ID from the object
        return this.windows.get(this.activeChannel.id)!; 
    }

    getActiveBuffer(): ChatBuffer { return this.getActiveWindow().buffer; }
    getBuffer(id: string): ChatBuffer { return this.windows.get(id)?.buffer; }

    getLastMessageId(channel: ChannelIdentity): string | undefined {
        const window = this.windows.get(channel.id);
        if (!window) return undefined;
        
        const msgs = window.buffer.messages;
        if (msgs.length === 0) return undefined;
        
        return msgs[msgs.length - 1].id;
    }

    subscribe(fn: Listener) {
        this.listeners.push(fn);
        return () => { this.listeners = this.listeners.filter(l => l !== fn); };
    }
    
    private notify() { this.listeners.forEach(fn => fn()); }

    pushToHistory(channel: ChannelIdentity) {
        // Prevent duplicates at the top of the stack (optional, but clean)
        const top = this.navigationStack[this.navigationStack.length - 1];
        if (top && top.id === channel.id) return;

        this.navigationStack.push(channel);
        
        // The Cap: Maintain strictly 50 items
        if (this.navigationStack.length > this.MAX_HISTORY) {
            this.navigationStack.shift(); // Remove the oldest
        }
    }
}
