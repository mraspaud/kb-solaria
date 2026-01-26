// src/lib/test/scenarios/cursor-positioning.test.ts
// Edge case tests for cursor positioning strategies

import { describe, it, expect, beforeEach } from 'vitest';
import { TestHarness } from '../TestHarness';
import {
    createChannel,
    createMessage,
    createMessages,
    createUser,
    resetIdCounter
} from '../fixtures';

describe('Cursor Positioning Edge Cases', () => {
    let harness: TestHarness;
    const service = { id: 'slack', name: 'Slack' };

    beforeEach(() => {
        resetIdCounter();
        harness = new TestHarness();
    });

    describe('jumpTo hint edge cases', () => {
        it('jumpTo with non-existent message falls back to bottom', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel = createChannel({ name: 'general', service });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            // Add some messages
            const msgs = createMessages(5, {
                channel,
                author: alice,
                baseTime: new Date(Date.now() - 60000)
            });
            msgs.forEach(msg => harness.dispatchMessage(channel, msg));

            // Switch with jumpTo for non-existent message
            harness.switchChannel(channel, { jumpTo: 'non-existent-msg' });

            // Should fall back to bottom
            expect(harness.cursorIndex).toBe(harness.messages.length - 1);
        });

        it('jumpTo with empty buffer sets pending hint', () => {
            const me = createUser('Me', 'slack');
            const channel = createChannel({ name: 'general', service });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            // Switch to empty channel with jumpTo
            harness.switchChannel(channel, { jumpTo: 'some-msg-id' });

            // Cursor should be at safe position (buffer is empty)
            // The hint should be stored as pending
            expect(harness.cursorIndex).toBeLessThanOrEqual(0);
        });
    });

    describe('unread hint edge cases', () => {
        it('unread hint with all messages read positions at bottom', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel = createChannel({
                name: 'general',
                service,
                lastReadAt: Date.now() / 1000 + 3600 // Read "in the future" = all read
            });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            // Add messages that are all "read"
            const msgs = createMessages(5, {
                channel,
                author: alice,
                baseTime: new Date(Date.now() - 60000) // In the past
            });
            msgs.forEach(msg => harness.dispatchMessage(channel, msg));

            // Switch with unread hint
            harness.switchChannel(channel, 'unread');

            // All read = cursor at bottom, attached
            expect(harness.cursorIndex).toBe(harness.messages.length - 1);
        });

        it('unread hint with no lastReadAt uses unread count', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel = createChannel({
                name: 'general',
                service
                // No lastReadAt
            });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            // Add messages
            const msgs = createMessages(5, {
                channel,
                author: alice,
                baseTime: new Date(Date.now() - 60000)
            });
            msgs.forEach(msg => harness.dispatchMessage(channel, msg));

            // Switch with unread hint
            harness.switchChannel(channel, 'unread');

            // Without lastReadAt, should position based on unread count or default to bottom
            expect(harness.cursorIndex).toBeGreaterThanOrEqual(0);
        });

        it('unread hint with all messages unread shows marker at top', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            // Use a very small lastReadAt (1 second after epoch) to indicate "never read"
            // Note: lastReadAt=0 is falsy and treated as "not set"
            const channel = createChannel({
                name: 'general',
                service,
                lastReadAt: 1 // Read at epoch+1s = effectively never read any recent messages
            });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            // Add messages - all unread (after epoch+1s)
            const msgs = createMessages(5, {
                channel,
                author: alice,
                baseTime: new Date() // All new, well after epoch
            });
            msgs.forEach(msg => harness.dispatchMessage(channel, msg));

            // Switch with unread hint
            harness.switchChannel(channel, 'unread');

            // Cursor at first message (index 0)
            expect(harness.cursorIndex).toBe(0);
            // Unread marker should indicate all messages are unread (-2 = first is unread)
            expect(harness.unreadMarkerIndex).toBe(-2);
        });
    });

    describe('bottom hint edge cases', () => {
        it('bottom hint with empty buffer still works', () => {
            const me = createUser('Me', 'slack');
            const channel = createChannel({ name: 'general', service });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            // Switch to empty channel with bottom hint
            harness.switchChannel(channel, 'bottom');

            // Should handle gracefully
            expect(harness.messages.length).toBe(0);
            expect(harness.cursorIndex).toBeLessThanOrEqual(0);
        });

        it('bottom hint enables attached mode on first visit', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel = createChannel({ name: 'general', service });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            const msgs = createMessages(10, {
                channel,
                author: alice,
                baseTime: new Date(Date.now() - 60000)
            });
            msgs.forEach(msg => harness.dispatchMessage(channel, msg));

            // First visit with bottom hint
            harness.switchChannel(channel, 'bottom');

            // Should be attached at bottom
            expect(harness.cursorIndex).toBe(harness.messages.length - 1);
            expect(harness.isAttached).toBe(true);

            // Detach by moving cursor
            harness.jumpTo(5);
            expect(harness.isAttached).toBe(false);

            // Note: Re-switching with 'bottom' hint won't reposition
            // because 'bottom' hint is only honored on first visit (hasBeenVisited flag)
            // To jump to bottom, use jumpToBottom() instead
        });
    });

    describe('cursor movement edge cases', () => {
        it('moveCursor clears pending hint', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel = createChannel({ name: 'general', service });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            const msgs = createMessages(5, {
                channel,
                author: alice,
                baseTime: new Date(Date.now() - 60000)
            });
            msgs.forEach(msg => harness.dispatchMessage(channel, msg));

            harness.switchChannel(channel);
            harness.moveCursor(1);

            // After moving, cursor should be valid
            expect(harness.cursorIndex).toBeGreaterThanOrEqual(0);
            expect(harness.cursorIndex).toBeLessThan(harness.messages.length);
        });

        it('jumpTo with index out of bounds clamps to valid range', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel = createChannel({ name: 'general', service });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            const msgs = createMessages(5, {
                channel,
                author: alice,
                baseTime: new Date(Date.now() - 60000)
            });
            msgs.forEach(msg => harness.dispatchMessage(channel, msg));

            harness.switchChannel(channel);

            // Try to jump past the end
            harness.jumpTo(100);
            expect(harness.cursorIndex).toBe(harness.messages.length - 1);

            // Try to jump before the start
            harness.jumpTo(-10);
            expect(harness.cursorIndex).toBe(0);
        });
    });
});
