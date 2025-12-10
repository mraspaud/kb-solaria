// src/lib/stores/chat.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { chatStore } from './chat';
import { Bucket } from '../logic/types';

describe('Chat Store Reactivity', () => {
    it('should NOT change messages reference when only moving cursor', () => {
        chatStore.dispatchMessage(
            { id: 'ch1', name: 'general', service: { id: 'int', name: 'Int' } },
            { id: 'm1', content: 'hello', author: { id: 'u1', name: 'A' }, timestamp: new Date() }
        );

        const stateBefore = get(chatStore);
        const messagesRef1 = stateBefore.messages;

        chatStore.moveCursor(1);

        const stateAfter = get(chatStore);
        const messagesRef2 = stateAfter.messages;

        expect(messagesRef1).toBe(messagesRef2); 
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
        chatStore.setIdentity('s1', me);
        chatStore.upsertChannels([channel]);
    });

    it('updates High Water Mark but preserves Unread Count when reading a specific message', () => {
        const msg = {
            id: 'm1',
            content: 'hello',
            author: { id: 'u2', name: 'User' },
            timestamp: new Date('2023-01-01T12:00:00Z'),
            // bucket property is ignored by dispatchMessage, driven by channel.starred above
        };

        // 1. Dispatch -> Should go to Inbox because channel is starred
        chatStore.dispatchMessage(channel, msg);
        
        chatStore.updateUnreadState('C1', 5, false);

        let state = get(chatStore);
        
        // Verify it landed in Inbox
        expect(state.virtualCounts.inbox).toBe(1);
        expect(state.unread['C1'].count).toBe(5);

        // 2. Action: Mark THIS message as read
        chatStore.markReadUpTo(channel, msg);

        state = get(chatStore);

        // 3. Assertions
        // A. Inbox should be cleared
        expect(state.virtualCounts.inbox).toBe(0);

        // B. Unread Count should be preserved (waiting for server)
        expect(state.unread['C1']).toBeDefined();
        expect(state.unread['C1'].count).toBe(5);

        // C. LastReadAt should be updated
        const updatedChannel = state.availableChannels.find(c => c.id === 'C1');
        expect(updatedChannel?.lastReadAt).toBe(msg.timestamp.getTime() / 1000);
    });
});
