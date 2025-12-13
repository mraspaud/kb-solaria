import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { chatStore } from './chat';

describe('Chat Store Reactivity', () => {
    beforeEach(() => {
        chatStore.reset(); // <--- Uses the public reset method
    });

    it('should hydrate messages array from IDs', () => {
        const channel = { id: 'ch1', name: 'general', service: { id: 'int', name: 'Int' } };
        const message = { id: 'm1', content: 'hello', author: { id: 'u1', name: 'A' }, timestamp: new Date(), reactions: {} };

        // 1. Dispatch
        chatStore.dispatchMessage(channel, message);

        // 2. Switch to view the buffer
        chatStore.switchChannel(channel);

        // 3. Verify Database & Hydration
        const state = get(chatStore);
        expect(state.entities.messages.has('m1')).toBe(true);
        expect(state.messages).toHaveLength(1);
        expect(state.messages[0].id).toBe('m1');
    });
});

describe('Chat Store - Read Logic', () => {
    const channel = { 
        id: 'C1', 
        name: 'general', 
        service: { id: 's1', name: 'Slack' }, 
        lastReadAt: 0,
        starred: true 
    };
    const me = { id: 'u1', name: 'Me', serviceId: 's1' };

    beforeEach(() => {
        chatStore.reset();
        chatStore.setIdentity('s1', me);
        chatStore.upsertChannels([channel]);
    });

    it('updates High Water Mark but preserves Unread Count when reading a specific message', () => {
        const msg = {
            id: 'm1',
            content: 'hello',
            author: { id: 'u2', name: 'User' },
            timestamp: new Date('2023-01-01T12:00:00Z'),
            reactions: {}
        };

        // 1. Dispatch -> Should go to Inbox (Starred)
        chatStore.dispatchMessage(channel, msg);
        chatStore.updateUnreadState('C1', 5, false);

        let state = get(chatStore);
        expect(state.virtualCounts.inbox).toBe(1);

        // 2. Mark Read
        chatStore.markReadUpTo(channel, msg);
        state = get(chatStore);

        // 3. Assertions
        expect(state.virtualCounts.inbox).toBe(0); // Cleared locally
        expect(state.unread['C1']).toBeDefined();
        expect(state.unread['C1'].count).toBe(5);  // Preserved for server sync
    });

    it('does NOT purge thread replies when reading the main channel', () => {
        // 1. Thread Reply Arrives (I participated)
        chatStore.hydrateParticipatedThreads(['t1']);
        
        const replyMsg = {
            id: 'm2',
            content: 'reply',
            author: { id: 'u2', name: 'Other' },
            timestamp: new Date('2023-01-01T12:05:00Z'),
            threadId: 't1',
            reactions: {}
        };

        chatStore.dispatchMessage(channel, replyMsg);
        
        // Should be in Triage (Context Bucket)
        let state = get(chatStore);
        expect(state.virtualCounts.triage).toBe(1);

        // 2. Mark MAIN CHANNEL as read (later timestamp)
        const laterMsg = { ...replyMsg, timestamp: new Date('2023-01-01T13:00:00Z') };
        chatStore.markReadUpTo(channel, laterMsg);

        // 3. Thread Reply should STILL be in Triage
        state = get(chatStore);
        expect(state.virtualCounts.triage).toBe(1);
    });
});

describe('Optimistic Updates (Reconciliation)', () => {
    const channel = { id: 'C1', name: 'general', service: { id: 's1', name: 'Slack' } };
    const me = { id: 'u1', name: 'Me', serviceId: 's1' };

    beforeEach(() => {
        chatStore.reset();
        chatStore.setIdentity('s1', me);
        chatStore.upsertChannels([channel]);
    });

    it('swaps temporary ID with real ID upon Ack, preserving position', () => {
        const tempId = 'tmp-123';
        const optimisticMsg = {
            id: tempId,
            clientId: tempId,
            content: 'Optimistic Hello',
            author: me,
            timestamp: new Date(),
            status: 'pending' as const,
            reactions: {}
        };

        // 1. Send & Switch
        chatStore.dispatchMessage(channel, optimisticMsg);
        chatStore.switchChannel(channel);

        // Verify Pending State
        let state = get(chatStore);
        expect(state.entities.messages.has(tempId)).toBe(true);
        expect(state.messages[0].id).toBe(tempId);
        expect(state.messages[0].status).toBe('pending');

        // 2. Ack arrives
        const realId = 'msg-999';
        const serverContent = 'Optimistic Hello (Sanitized)';
        chatStore.handleAck(tempId, realId, serverContent);

        // 3. Verify Swap
        state = get(chatStore);
        
        // Database updated
        expect(state.entities.messages.has(tempId)).toBe(false);
        expect(state.entities.messages.has(realId)).toBe(true);
        
        // View hydrated correctly
        expect(state.messages[0].id).toBe(realId);
        expect(state.messages[0].content).toBe(serverContent);
        expect(state.messages[0].status).toBe('sent');
    });

    it('ignores Ack if message is already handled (Race Condition Guard)', () => {
        const tempId = 'tmp-race';
        chatStore.dispatchMessage(channel, {
            id: tempId, clientId: tempId, content: 'Race', author: me, timestamp: new Date(), reactions: {}
        });
        chatStore.switchChannel(channel);

        // First Ack (Wins)
        chatStore.handleAck(tempId, 'real-1');
        
        // Second Ack (Should be ignored safely)
        chatStore.handleAck(tempId, 'real-2');

        const state = get(chatStore);
        expect(state.messages[0].id).toBe('real-1');
    });
    // it('swaps temporary ID with real ID upon Ack, preserving position', () => {
    //     const tempId = 'tmp-123';
    //     const optimisticMsg = {
    //         id: tempId, clientId: tempId, content: 'Optimistic Hello',
    //         author: me, timestamp: new Date(), status: 'pending', reactions: {}
    //     };
    //
    //     chatStore.dispatchMessage(channel, optimisticMsg);
    //
    //     chatStore.switchChannel(channel);
    //
    //     // Verify Pending State
    //     let state = get(chatStore);
    //     expect(state.entities.messages.has(tempId)).toBe(true);
    //     expect(state.messages[0].id).toBe(tempId); // This will pass now
    //
    //     // 2. Ack arrives
    //     const realId = 'msg-999';
    //     chatStore.handleAck(tempId, realId, 'Server Content');
    //
    //     // 3. Verify Swap
    //     state = get(chatStore);
    //     expect(state.entities.messages.has(tempId)).toBe(false);
    //     expect(state.entities.messages.has(realId)).toBe(true);
    //     expect(state.messages[0].id).toBe(realId);
    // });
    //
    // it('ignores Ack if message is already handled (Race Condition Guard)', () => {
    //     const tempId = 'tmp-race';
    //     chatStore.dispatchMessage(channel, {
    //         id: tempId, clientId: tempId, content: 'Race', author: me, timestamp: new Date(), reactions: {}
    //     });
    //
    //     chatStore.switchChannel(channel);
    //
    //     // First Ack
    //     chatStore.handleAck(tempId, 'real-1');
    //
    //     // Second Ack
    //     chatStore.handleAck(tempId, 'real-2');
    //
    //     const state = get(chatStore);
    //     expect(state.messages[0].id).toBe('real-1');
    // });
});
