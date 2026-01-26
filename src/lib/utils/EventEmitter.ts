/**
 * Simple event emitter for the observer pattern.
 * Use T=void for simple notifications, or a specific type for payloads.
 */
export class EventEmitter<T = void> {
    private listeners: ((payload: T) => void)[] = [];

    subscribe(fn: (payload: T) => void): () => void {
        this.listeners.push(fn);
        return () => {
            this.listeners = this.listeners.filter(l => l !== fn);
        };
    }

    protected notify(payload: T): void {
        this.listeners.forEach(fn => fn(payload));
    }
}

/**
 * Simple notifier for void events (no payload).
 * Convenience class with a parameter-less notify().
 */
export class Notifier extends EventEmitter<void> {
    protected override notify(): void {
        super.notify(undefined as void);
    }
}
