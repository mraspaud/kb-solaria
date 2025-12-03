import type { Message } from './types';

type Listener = () => void;

export class ChatBuffer {
    messages: Message[] = [];
    private listeners: Listener[] = [];

    addMessage(msg: Message) {
        this.messages.push(msg);
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
