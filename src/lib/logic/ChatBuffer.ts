type Listener = () => void;

export class ChatBuffer {
    messageIds: string[] = [];
    private listeners: Listener[] = [];

    addMessageId(id: string) {
        // Prevent duplicates (Set behavior)
        if (!this.messageIds.includes(id)) {
            this.messageIds.push(id);
        }
        this.notify();
    }
    
    prependMessageId(id: string) {
        if (!this.messageIds.includes(id)) {
            this.messageIds.unshift(id);
        }
        this.notify();
    }

    removeMessageId(id: string) {
        this.messageIds = this.messageIds.filter(mid => mid !== id);
        this.notify();
    }

    /**
     * Replace messageIds array and notify listeners.
     * Use this instead of direct assignment to ensure reactivity.
     */
    setMessageIds(ids: string[]) {
        this.messageIds = ids;
        this.notify();
    }

    clear() {
        this.messageIds = [];
        this.notify();
    }

    subscribe(fn: Listener) {
        this.listeners.push(fn);
        return () => {
            this.listeners = this.listeners.filter(l => l !== fn);
        };
    }

    private notify() {
        this.listeners.forEach(fn => fn());
    }
}
