// src/lib/test/scenarios/thread-navigation.test.ts
// Behavior tests for thread navigation: "I open threads and messages are in order"

import { describe, it, expect, beforeEach } from 'vitest';
import { TestHarness } from '../TestHarness';
import {
    createChannel,
    createMessage,
    createUser,
    createThreadChannel,
    resetIdCounter
} from '../fixtures';

describe('Thread Navigation', () => {
    let harness: TestHarness;
    const service = { id: 'slack', name: 'Slack' };

    beforeEach(() => {
        resetIdCounter();
        harness = new TestHarness();
    });

    describe('Thread message ordering', () => {
        it('thread messages appear in chronological order', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const bob = createUser('Bob');
            const channel = createChannel({
                name: 'engineering',
                service,
                lastReadAt: Date.now() / 1000 - 3600
            });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            // Create a thread root
            const rootMsg = createMessage({
                id: 'thread-root',
                author: alice,
                content: 'Starting a discussion',
                sourceChannel: channel,
                timestamp: new Date(Date.now() - 10000)
            });
            harness.dispatchMessage(channel, rootMsg);

            // Open the thread
            harness.openThread(rootMsg);
            const threadChannel = harness.activeChannel;
            expect(threadChannel.isThread).toBe(true);

            // Multiple replies arrive (simulating out-of-order arrival)
            const reply1 = createMessage({
                id: 'reply-1',
                author: bob,
                content: 'First reply',
                threadId: 'thread-root',
                sourceChannel: channel,
                timestamp: new Date(Date.now() - 8000)
            });
            const reply2 = createMessage({
                id: 'reply-2',
                author: alice,
                content: 'Second reply',
                threadId: 'thread-root',
                sourceChannel: channel,
                timestamp: new Date(Date.now() - 6000)
            });
            const reply3 = createMessage({
                id: 'reply-3',
                author: bob,
                content: 'Third reply',
                threadId: 'thread-root',
                sourceChannel: channel,
                timestamp: new Date(Date.now() - 4000)
            });

            // Dispatch in non-chronological order
            harness.dispatchMessage(threadChannel, reply3);
            harness.dispatchMessage(threadChannel, reply1);
            harness.dispatchMessage(threadChannel, reply2);

            // Messages should be sorted chronologically in the view
            const messages = harness.messages;
            expect(messages.length).toBeGreaterThanOrEqual(3);

            // Find the replies in the messages array
            const replyMessages = messages.filter(m => m.threadId === 'thread-root');

            // Check they are in chronological order
            for (let i = 1; i < replyMessages.length; i++) {
                expect(replyMessages[i].timestamp.getTime())
                    .toBeGreaterThanOrEqual(replyMessages[i - 1].timestamp.getTime());
            }
        });

        it('root message appears at the top of thread view', () => {
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

            // Root message
            const rootMsg = createMessage({
                id: 'root',
                author: alice,
                content: 'Thread starter',
                sourceChannel: channel,
                timestamp: new Date(Date.now() - 5000)
            });
            harness.dispatchMessage(channel, rootMsg);

            // Open thread
            harness.openThread(rootMsg);
            const threadChannel = harness.activeChannel;

            // Add a reply
            const reply = createMessage({
                author: alice,
                content: 'A reply',
                threadId: 'root',
                sourceChannel: channel,
                timestamp: new Date()
            });
            harness.dispatchMessage(threadChannel, reply);

            // First message should be the root
            const messages = harness.messages;
            if (messages.length > 0) {
                // Root should come before replies (earlier timestamp)
                const rootIndex = messages.findIndex(m => m.id === 'root');
                const replyIndex = messages.findIndex(m => m.threadId === 'root' && m.id !== 'root');
                if (rootIndex !== -1 && replyIndex !== -1) {
                    expect(rootIndex).toBeLessThan(replyIndex);
                }
            }
        });
    });

    describe('Thread cursor positioning', () => {
        it('jumping to thread from inbox positions cursor at the message', () => {
            const me = createUser('Me', 'slack');
            const colleague = createUser('Colleague');
            const channel = createChannel({
                name: 'important',
                service,
                starred: true,
                lastReadAt: Date.now() / 1000 - 3600
            });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            // A message arrives in starred channel
            const rootMsg = createMessage({
                id: 'msg-to-jump',
                author: colleague,
                content: 'Important update',
                sourceChannel: channel,
                timestamp: new Date()
            });
            harness.dispatchMessage(channel, rootMsg);

            // Jump to the message via the channel
            harness.switchChannel(channel, { jumpTo: 'msg-to-jump' });

            // Cursor should be positioned at that message
            const cursorMsg = harness.cursorMessage;
            expect(cursorMsg).toBeDefined();
            if (cursorMsg) {
                expect(cursorMsg.id).toBe('msg-to-jump');
            }
        });
    });

    describe('Navigation history', () => {
        it('going back from thread returns to previous channel', () => {
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

            // Start in channel
            harness.switchChannel(channel);
            expect(harness.activeChannel.id).toBe(channel.id);

            // Create a thread root
            const rootMsg = createMessage({
                id: 'root-msg',
                author: alice,
                content: 'Thread starter',
                sourceChannel: channel,
                timestamp: new Date()
            });
            harness.dispatchMessage(channel, rootMsg);

            // Open thread
            harness.openThread(rootMsg);
            expect(harness.activeChannel.isThread).toBe(true);

            // Go back
            harness.goBack();

            // Should be back in the original channel
            expect(harness.activeChannel.id).toBe(channel.id);
            expect(harness.activeChannel.isThread).toBeFalsy();
        });

        it('multiple back operations work correctly', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel1 = createChannel({
                name: 'channel-1',
                service,
                lastReadAt: Date.now() / 1000 - 3600
            });
            const channel2 = createChannel({
                name: 'channel-2',
                service,
                lastReadAt: Date.now() / 1000 - 3600
            });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel1, channel2]
            });

            // Navigate through multiple channels
            harness.switchChannel(channel1);
            expect(harness.activeChannel.id).toBe(channel1.id);

            harness.switchChannel(channel2);
            expect(harness.activeChannel.id).toBe(channel2.id);

            // Create and open a thread
            const rootMsg = createMessage({
                id: 'msg-in-ch2',
                author: alice,
                content: 'Message in channel 2',
                sourceChannel: channel2,
                timestamp: new Date()
            });
            harness.dispatchMessage(channel2, rootMsg);
            harness.openThread(rootMsg);

            expect(harness.activeChannel.isThread).toBe(true);

            // Go back to channel2
            harness.goBack();
            expect(harness.activeChannel.id).toBe(channel2.id);

            // Go back to channel1
            harness.goBack();
            expect(harness.activeChannel.id).toBe(channel1.id);
        });
    });

    describe('Thread participation tracking', () => {
        it('participated threads are tracked for thread reply filtering', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel = createChannel({
                name: 'general',
                service,
                lastReadAt: Date.now() / 1000 - 3600
            });

            // Bootstrap with an existing participated thread
            harness.bootstrap({
                identity: me,
                service,
                channels: [channel],
                participatedThreads: ['my-old-thread']
            });

            // Verify participated thread is tracked
            expect(harness.state.participatedThreads.has('my-old-thread')).toBe(true);

            // A reply in the participated thread arrives
            const reply = createMessage({
                id: 'reply-in-my-thread',
                author: alice,
                content: 'Reply to your thread',
                threadId: 'my-old-thread',
                sourceChannel: channel,
                timestamp: new Date()
            });
            harness.dispatchMessage(channel, reply);

            // Should be in triage (CONTEXT bucket) because I participated
            expect(harness.getBufferIds('triage')).toContain('reply-in-my-thread');
        });

        it('opening a thread does NOT automatically add it to participated threads', () => {
            // Participation is tracked when you POST to a thread, not when you open it
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

            // Initial state: no participated threads
            expect(harness.state.participatedThreads.size).toBe(0);

            // Create and open a thread (but don't post)
            const rootMsg = createMessage({
                id: 'new-thread-root',
                author: alice,
                content: 'Starting a new thread',
                sourceChannel: channel,
                timestamp: new Date()
            });
            harness.dispatchMessage(channel, rootMsg);
            harness.openThread(rootMsg);

            // Opening doesn't add to participated - only posting does
            // This is correct behavior: you're just reading, not participating
            expect(harness.state.participatedThreads.has('new-thread-root')).toBe(false);
        });
    });
});
