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

    it('preserves threadId on message entities for inbox purge matching', () => {
        // This test ensures thread replies stored in entities have their threadId
        // so that inbox/triage purge logic can match them to their parent thread.
        // Bug: messages were being stored without threadId, causing purge to fail.

        const payload = {
            event: 'message',
            service: { id: 's1', name: 'Slack' },
            channel_id: 'C1',
            thread_id: 'root-msg-123',  // This is the parent thread
            message: {
                id: 'reply-456',
                body: 'This is a thread reply',
                thread_id: 'root-msg-123',
                timestamp: Date.now(),
                author: { id: 'u1', display_name: 'User' }
            }
        };

        // Simulate incoming thread reply
        eventCallback(payload);

        // Get the stored message entity
        const state = get(chatStore);
        const storedMessage = state.entities.messages.get('reply-456');

        // CRITICAL: threadId must be preserved for inbox purge to work
        expect(storedMessage).toBeDefined();
        expect(storedMessage?.threadId).toBe('root-msg-123');
    });

    it('stores root messages without threadId', () => {
        // Root messages (not replies) should not have threadId
        const payload = {
            event: 'message',
            service: { id: 's1', name: 'Slack' },
            channel_id: 'C1',
            // No thread_id - this is a root message
            message: {
                id: 'root-msg-789',
                body: 'This is a root message',
                timestamp: Date.now(),
                author: { id: 'u1', display_name: 'User' }
            }
        };

        eventCallback(payload);

        const state = get(chatStore);
        const storedMessage = state.entities.messages.get('root-msg-789');

        expect(storedMessage).toBeDefined();
        expect(storedMessage?.threadId).toBeUndefined();
    });
});
