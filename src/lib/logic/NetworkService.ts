import { writable, type Writable } from 'svelte/store';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export interface NetworkEvent {
    event: string;
    [key: string]: any;
}

type EventHandler = (payload: any) => void;

export class NetworkService {
    public status: Writable<ConnectionStatus> = writable('disconnected');
    
    private socket: WebSocket | null = null;
    private url: string;
    private reconnectTimer: number | undefined;
    private listeners: EventHandler[] = [];

    constructor(url: string) {
        this.url = url;
    }

    connect() {
        if (this.socket?.readyState === WebSocket.CONNECTING || this.socket?.readyState === WebSocket.OPEN) return;

        this.status.set('connecting');
        clearTimeout(this.reconnectTimer);

        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
            this.status.set('connected');
        };

        this.socket.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                this.notify(payload);
            } catch (e) {
                console.error("NetworkService: Parse error", e);
            }
        };

        this.socket.onclose = () => {
            this.status.set('disconnected');
            this.socket = null;
            // Auto-reconnect after 3s
            this.reconnectTimer = setTimeout(() => this.connect(), 3000);
        };

        this.socket.onerror = () => {
            this.status.set('error');
            this.socket?.close();
        };
    }

    send(data: any) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        } else {
            console.warn("NetworkService: Attempted to send while disconnected", data);
        }
    }

    onEvent(fn: EventHandler) {
        this.listeners.push(fn);
        return () => {
            this.listeners = this.listeners.filter(l => l !== fn);
        };
    }

    private notify(payload: any) {
        this.listeners.forEach(fn => fn(payload));
    }

    disconnect() {
        clearTimeout(this.reconnectTimer);
        this.socket?.close();
    }
}
