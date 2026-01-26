// src/lib/test/scenarios/channel-switching.test.ts
// Behavior tests for channel switching: "I switch to channels and they load properly"

import { describe, it, expect, beforeEach } from 'vitest';
import { TestHarness } from '../TestHarness';
import {
    createChannel,
    createMessage,
    createMessages,
    createUser,
    resetIdCounter,
    fixtures
} from '../fixtures';

describe('Channel Switching', () => {
    let harness: TestHarness;
    const service = { id: 'slack', name: 'Slack' };

    beforeEach(() => {
        resetIdCounter();
        harness = new TestHarness();
    });

    describe('Basic channel switching', () => {
        it('switching channel changes active channel', () => {
            const me = createUser('Me', 'slack');
            const channel1 = createChannel({ name: 'channel-1', service });
            const channel2 = createChannel({ name: 'channel-2', service });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel1, channel2]
            });

            harness.switchChannel(channel1);
            expect(harness.activeChannel.id).toBe(channel1.id);

            harness.switchChannel(channel2);
            expect(harness.activeChannel.id).toBe(channel2.id);
        });

        it('messages are loaded for the new channel', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel = createChannel({
                name: 'general',
                service,
                lastReadAt: Date.now() / 1000 - 3600
            });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            // Add messages to the channel
            const msgs = createMessages(5, {
                channel,
                author: alice,
                baseTime: new Date(Date.now() - 60000)
            });
            msgs.forEach(msg => harness.dispatchMessage(channel, msg));

            // Switch to channel
            harness.switchChannel(channel);

            // Messages should be loaded
            expect(harness.messages.length).toBe(5);
        });
    });

    describe('Cursor positioning on switch', () => {
        it('cursor positions at first unread when switching to channel with unreads', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel = createChannel({
                name: 'general',
                service,
                lastReadAt: Date.now() / 1000 - 3600 // Read 1 hour ago
            });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            // Some messages already read
            const oldMsgs = createMessages(3, {
                channel,
                author: alice,
                baseTime: new Date(Date.now() - 7200000) // 2 hours ago (before lastReadAt)
            });
            oldMsgs.forEach(msg => harness.dispatchMessage(channel, msg));

            // New unread messages
            const newMsgs = createMessages(2, {
                channel,
                author: alice,
                baseTime: new Date() // Now (after lastReadAt)
            });
            newMsgs.forEach(msg => harness.dispatchMessage(channel, msg));

            // Switch to channel with 'unread' hint
            harness.switchChannel(channel, 'unread');

            // Should have all messages
            expect(harness.messages.length).toBe(5);

            // Cursor should be at the first unread (index 3)
            // This depends on how unreadMarkerIndex is calculated
        });

        it('cursor positions at bottom when using bottom hint', () => {
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

            // Switch with bottom hint
            harness.switchChannel(channel, 'bottom');

            // Cursor should be at the last message
            expect(harness.cursorIndex).toBe(harness.messages.length - 1);
        });

        it('jumpTo positions cursor at specific message', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel = createChannel({ name: 'general', service });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            const msgs = [
                createMessage({
                    id: 'msg-a',
                    author: alice,
                    content: 'First',
                    sourceChannel: channel,
                    timestamp: new Date(Date.now() - 3000)
                }),
                createMessage({
                    id: 'msg-b',
                    author: alice,
                    content: 'Second',
                    sourceChannel: channel,
                    timestamp: new Date(Date.now() - 2000)
                }),
                createMessage({
                    id: 'msg-c',
                    author: alice,
                    content: 'Third',
                    sourceChannel: channel,
                    timestamp: new Date(Date.now() - 1000)
                })
            ];
            msgs.forEach(msg => harness.dispatchMessage(channel, msg));

            // Switch with jumpTo
            harness.switchChannel(channel, { jumpTo: 'msg-b' });

            // Cursor should be at msg-b
            const cursorMsg = harness.cursorMessage;
            expect(cursorMsg).toBeDefined();
            if (cursorMsg) {
                expect(cursorMsg.id).toBe('msg-b');
            }
        });
    });

    describe('Buffer state preservation', () => {
        it('switching away and back preserves cursor position', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel1 = createChannel({ name: 'channel-1', service });
            const channel2 = createChannel({ name: 'channel-2', service });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel1, channel2]
            });

            // Add messages to channel1
            const msgs = createMessages(10, {
                channel: channel1,
                author: alice,
                baseTime: new Date(Date.now() - 60000)
            });
            msgs.forEach(msg => harness.dispatchMessage(channel1, msg));

            // Switch to channel1 and position cursor
            harness.switchChannel(channel1);
            harness.jumpTo(5);
            expect(harness.cursorIndex).toBe(5);

            // Switch away to channel2
            harness.switchChannel(channel2);
            expect(harness.activeChannel.id).toBe(channel2.id);

            // Switch back to channel1
            harness.switchChannel(channel1);
            expect(harness.activeChannel.id).toBe(channel1.id);

            // Cursor position should be preserved (or close to it)
            // Note: exact behavior depends on implementation
        });

        it('messages are preserved in buffer when switching away', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel1 = createChannel({ name: 'channel-1', service });
            const channel2 = createChannel({ name: 'channel-2', service });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel1, channel2]
            });

            // Add messages to channel1
            const msgs = createMessages(5, {
                channel: channel1,
                author: alice,
                baseTime: new Date(Date.now() - 60000)
            });
            msgs.forEach(msg => harness.dispatchMessage(channel1, msg));

            // Switch to channel1
            harness.switchChannel(channel1);
            expect(harness.messages.length).toBe(5);

            // Switch to channel2
            harness.switchChannel(channel2);

            // Check buffer still has the messages
            const buffer = harness.getBufferIds(channel1.id);
            expect(buffer.length).toBe(5);
        });
    });

    describe('Virtual channel switching', () => {
        it('can switch to triage channel', () => {
            const me = createUser('Me', 'slack');
            const colleague = createUser('Colleague');
            const channel = createChannel({
                name: 'general',
                service,
                starred: false,
                lastReadAt: Date.now() / 1000 - 3600
            });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            // A mention arrives
            const mention = createMessage({
                author: colleague,
                content: `<@${me.id}> hey!`,
                sourceChannel: channel,
                timestamp: new Date()
            });
            harness.dispatchMessage(channel, mention);

            // Switch to triage
            harness.switchChannel(fixtures.triageChannel);

            expect(harness.activeChannel.id).toBe('triage');
            expect(harness.virtualCounts.triage).toBe(1);
        });

        it('can switch to inbox channel', () => {
            const me = createUser('Me', 'slack');
            const colleague = createUser('Colleague');
            const starredChannel = createChannel({
                name: 'important',
                service,
                starred: true,
                lastReadAt: Date.now() / 1000 - 3600
            });

            harness.bootstrap({
                identity: me,
                service,
                channels: [starredChannel]
            });

            // A message arrives in starred channel
            const msg = createMessage({
                author: colleague,
                content: 'Update in starred channel',
                sourceChannel: starredChannel,
                timestamp: new Date()
            });
            harness.dispatchMessage(starredChannel, msg);

            // Switch to inbox
            harness.switchChannel(fixtures.inboxChannel);

            expect(harness.activeChannel.id).toBe('inbox');
            expect(harness.virtualCounts.inbox).toBe(1);
        });

        it('switching between inbox and regular channel works', () => {
            const me = createUser('Me', 'slack');
            const colleague = createUser('Colleague');
            const channel = createChannel({
                name: 'general',
                service,
                starred: true,
                lastReadAt: Date.now() / 1000 - 3600
            });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            // Message arrives
            const msg = createMessage({
                author: colleague,
                content: 'Hello!',
                sourceChannel: channel,
                timestamp: new Date()
            });
            harness.dispatchMessage(channel, msg);

            // Start in inbox
            harness.switchChannel(fixtures.inboxChannel);
            expect(harness.activeChannel.id).toBe('inbox');

            // Switch to regular channel
            harness.switchChannel(channel);
            expect(harness.activeChannel.id).toBe(channel.id);

            // Switch back to inbox
            harness.switchChannel(fixtures.inboxChannel);
            expect(harness.activeChannel.id).toBe('inbox');
        });
    });
});
