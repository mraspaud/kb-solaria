// src/lib/socketStore.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { chatStore } from './stores/chat';

// 1. Create Hoisted Spies
const { mockOnEvent, mockSend } = vi.hoisted(() => {
    return {
        mockOnEvent: vi.fn(),
        mockSend: vi.fn()
    };
});

// 2. Mock the Service
vi.mock('./logic/NetworkService', () => {
    return {
        NetworkService: class {
            status = { 
                subscribe: vi.fn((run) => {
                    run('connected'); // Give it a value so get() works
                    return () => {};  // Return the required unsubscribe function
                }), 
                set: vi.fn() 
            };
            onEvent = mockOnEvent;
            send = mockSend;
            connect = vi.fn();
        }
    };
});

// 3. Import the module under test
import './socketStore';

describe('SocketStore Message Handling', () => {
    let eventCallback: (payload: any) => void;

    beforeEach(() => {
        chatStore.upsertChannels([{ id: 'C1', name: 'general', service: { id: 's1', name: 'Slack' } }]);
 
        if (mockOnEvent.mock.calls.length === 0) {
            throw new Error("socketStore did not register an event listener!");
        }
        eventCallback = mockOnEvent.mock.calls[0][0];
    });

    it('correctly populates parentChannel for thread messages', () => {
        const payload = {
            event: 'message',
            service: { id: 's1', name: 'Slack' },
            channel_id: 'C1', 
            thread_id: 'T1', 
            message: {
                id: 'm1',
                body: 'reply',
                thread_id: 'T1',
                timestamp: Date.now(),
                author: { id: 'u1', display_name: 'User' }
            }
        };

        // 1. Simulate incoming message
        eventCallback(payload);

        // 2. Inspect the chatStore
        const state = get(chatStore);
        const threadChan = state.availableChannels.find(c => c.id === 'thread_T1');

        expect(threadChan).toBeDefined();
        expect(threadChan?.isThread).toBe(true);
        
        // This confirms the fix in socketStore.ts
        expect(threadChan?.parentChannel).toBeDefined();
        expect(threadChan?.parentChannel?.id).toBe('C1');
    });
});
