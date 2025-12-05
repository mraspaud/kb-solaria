import type { Message } from './types';

type Listener = () => void;

export class ChatBuffer {
    messages: Message[] = [];
    private listeners: Listener[] = [];

    addMessage(msg: Message) {
        const existingIndex = this.messages.findIndex(m => m.id === msg.id);

        if (existingIndex !== -1) {
            this.messages[existingIndex] = { ...this.messages[existingIndex], ...msg };
        } else {
            this.messages.push(msg);
 
            this.messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        }

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
