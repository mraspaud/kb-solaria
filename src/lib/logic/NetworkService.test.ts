import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NetworkService } from './NetworkService';

// Mock the global WebSocket with required Static Constants
class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    onopen: (() => void) | null = null;
    onmessage: ((e: MessageEvent) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: ((e: Event) => void) | null = null;
    send = vi.fn();
    close = vi.fn();
    readyState = 0; // Default to CONNECTING

    constructor(public url: string) {}
}

describe('NetworkService', () => {
    let service: NetworkService;
    let mockSocket: MockWebSocket;

    beforeEach(() => {
        // Hijack the global WebSocket
        vi.stubGlobal('WebSocket', MockWebSocket);
        service = new NetworkService('ws://test.local');
        
        // Connect and grab the mock instance
        service.connect();
        // @ts-ignore - accessing the private/internal socket for testing triggers
        mockSocket = service['socket']; 
    });

    it('connects to the correct URL', () => {
        expect(mockSocket).toBeDefined();
        expect(mockSocket.url).toBe('ws://test.local');
    });

    it('emits status updates on connection lifecycle', () => {
        const statusLog: string[] = [];
        service.status.subscribe(s => statusLog.push(s));

        // Simulate Open
        mockSocket.onopen?.();
        expect(statusLog).toContain('connected');

        // Simulate Close
        mockSocket.onclose?.();
        expect(statusLog).toContain('disconnected');
    });

    it('parses incoming JSON messages', () => {
        const events: any[] = [];
        service.onEvent((payload) => events.push(payload));

        const rawData = JSON.stringify({ event: 'message', content: 'hello' });
        
        // Trigger the socket message
        mockSocket.onmessage?.(new MessageEvent('message', { data: rawData }));

        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({ event: 'message', content: 'hello' });
    });

    it('handles JSON parse errors gracefully', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        
        // Trigger bad data
        mockSocket.onmessage?.(new MessageEvent('message', { data: 'NOT JSON' }));

        // Should not crash, just log error
        expect(consoleSpy).toHaveBeenCalled();
    });

    it('queues messages if sending while disconnected', () => {
        // Socket is effectively closed/connecting here
        service.send({ command: 'test' });
        
        expect(mockSocket.send).not.toHaveBeenCalled(); 
    });
});
