// src/lib/test/scenarios/inbox-workflow.test.ts
// Behavior tests for inbox workflow: "I open inbox, read items, they disappear"

import { describe, it, expect, beforeEach } from 'vitest';
import { TestHarness } from '../TestHarness';
import {
    createChannel,
    createMessage,
    createUser,
    createThreadChannel,
    resetIdCounter,
    fixtures
} from '../fixtures';

describe('Inbox Workflow', () => {
    let harness: TestHarness;
    const service = { id: 'slack', name: 'Slack' };

    beforeEach(() => {
        resetIdCounter();
        harness = new TestHarness();
    });

    describe('Basic inbox purge', () => {
        it('message disappears from inbox after jumping to source and reading', () => {
            // Setup: A message from a starred channel
            const me = createUser('Me', 'slack');
            const colleague = createUser('Colleague');
            const starredChannel = createChannel({
                name: 'important-project',
                service,
                starred: true,
                lastReadAt: Date.now() / 1000 - 3600 // Read 1 hour ago
            });

            harness.bootstrap({
                identity: me,
                service,
                channels: [starredChannel]
            });

            // A message arrives in the starred channel -> SIGNAL -> Inbox
            const msg = createMessage({
                author: colleague,
                content: 'Project update: deployed v2.0',
                sourceChannel: starredChannel,
                timestamp: new Date()
            });
            harness.dispatchMessage(starredChannel, msg);

            // Verify: Message is in inbox
            expect(harness.virtualCounts.inbox).toBe(1);
            expect(harness.getBufferIds('inbox')).toContain(msg.id);

            // Action: User jumps to the source channel and reads it
            harness.switchChannel(starredChannel, { jumpTo: msg.id });
            harness.markReadUpTo(starredChannel, msg);

            // Assert: Message should be gone from inbox
            expect(harness.virtualCounts.inbox).toBe(0);
            expect(harness.getBufferIds('inbox')).not.toContain(msg.id);
        });

        it('unrelated messages stay in inbox when I read one item', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const bob = createUser('Bob');

            const channel1 = createChannel({
                name: 'project-a',
                service,
                starred: true,
                lastReadAt: Date.now() / 1000 - 3600
            });
            const channel2 = createChannel({
                name: 'project-b',
                service,
                starred: true,
                lastReadAt: Date.now() / 1000 - 3600
            });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel1, channel2]
            });

            // Two messages arrive in different starred channels
            const msg1 = createMessage({
                author: alice,
                content: 'Update in project A',
                sourceChannel: channel1,
                timestamp: new Date()
            });
            const msg2 = createMessage({
                author: bob,
                content: 'Update in project B',
                sourceChannel: channel2,
                timestamp: new Date(Date.now() + 1000)
            });

            harness.dispatchMessage(channel1, msg1);
            harness.dispatchMessage(channel2, msg2);

            // Verify: Both messages in inbox
            expect(harness.virtualCounts.inbox).toBe(2);

            // Action: Read only the first message
            harness.switchChannel(channel1, { jumpTo: msg1.id });
            harness.markReadUpTo(channel1, msg1);

            // Assert: Only msg1 is purged, msg2 remains
            expect(harness.virtualCounts.inbox).toBe(1);
            expect(harness.getBufferIds('inbox')).not.toContain(msg1.id);
            expect(harness.getBufferIds('inbox')).toContain(msg2.id);
        });
    });

    describe('Thread purge from inbox', () => {
        it('thread root disappears from inbox after reading thread to end', () => {
            // This is the bug we're currently debugging!
            // This test should FAIL until the bug is fixed.

            const me = createUser('Me', 'slack');
            const colleague = createUser('Colleague');
            const starredChannel = createChannel({
                name: 'important-project',
                service,
                starred: true,
                lastReadAt: Date.now() / 1000 - 3600
            });

            harness.bootstrap({
                identity: me,
                service,
                channels: [starredChannel]
            });

            // Root message arrives in starred channel -> SIGNAL -> Inbox
            const rootMsg = createMessage({
                id: 'thread-root-001',
                author: colleague,
                content: 'Starting a thread about deployment',
                sourceChannel: starredChannel,
                timestamp: new Date()
            });
            harness.dispatchMessage(starredChannel, rootMsg);

            // Verify: Root message is in inbox
            expect(harness.virtualCounts.inbox).toBe(1);
            expect(harness.getBufferIds('inbox')).toContain('thread-root-001');

            // User opens the thread
            harness.openThread(rootMsg);
            const threadChannel = harness.activeChannel;
            expect(threadChannel.isThread).toBe(true);
            expect(threadChannel.id).toBe('thread_thread-root-001');

            // A reply arrives in the thread
            const reply = createMessage({
                author: colleague,
                content: 'Here are the details...',
                threadId: 'thread-root-001',
                sourceChannel: starredChannel,
                timestamp: new Date(Date.now() + 1000)
            });
            harness.dispatchMessage(threadChannel, reply);

            // User reads to the end of the thread
            harness.jumpToBottom();
            harness.markReadUpTo(threadChannel, reply);

            // User goes back
            harness.goBack();

            // Navigate to inbox to check
            harness.switchChannel(fixtures.inboxChannel);

            // THIS IS THE BUG - the root message should be purged from inbox
            // but currently it isn't
            expect(harness.virtualCounts.inbox).toBe(0);
            expect(harness.getBufferIds('inbox')).not.toContain('thread-root-001');
        });

        it('thread reply in inbox disappears after reading the thread', () => {
            // Thread replies can also appear in inbox (if from starred channel)
            const me = createUser('Me', 'slack');
            const colleague = createUser('Colleague');
            const starredChannel = createChannel({
                name: 'important-project',
                service,
                starred: true,
                lastReadAt: Date.now() / 1000 - 3600
            });

            harness.bootstrap({
                identity: me,
                service,
                channels: [starredChannel]
            });

            // Thread reply arrives (not the root, just a reply)
            // This goes to inbox because it's from a starred channel
            const reply = createMessage({
                id: 'reply-001',
                author: colleague,
                content: 'Following up on the deployment',
                threadId: 'some-thread-root',
                sourceChannel: starredChannel,
                timestamp: new Date()
            });
            harness.dispatchMessage(starredChannel, reply);

            // Note: Thread replies from starred channels may go to SIGNAL or NOISE
            // depending on BucketAnalyzer rules. Let's check what we got.
            // For this test, we're checking the purge logic IF it ends up in inbox.
            const inInbox = harness.getBufferIds('inbox').includes('reply-001');

            if (inInbox) {
                // User opens the thread and reads it
                const threadChannel = createThreadChannel('some-thread-root', starredChannel);
                harness.switchChannel(threadChannel);
                harness.dispatchMessage(threadChannel, reply);
                harness.jumpToBottom();
                harness.markReadUpTo(threadChannel, reply);
                harness.goBack();

                // Reply should be purged from inbox
                expect(harness.getBufferIds('inbox')).not.toContain('reply-001');
            }
        });
    });

    describe('Edge cases', () => {
        it('reading main channel does NOT purge thread replies from inbox', () => {
            // Thread replies have their own lifecycle - reading the channel
            // shouldn't remove them, only reading the actual thread should.

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
                channels: [channel],
                participatedThreads: ['existing-thread']
            });

            // A thread reply arrives (CONTEXT bucket -> Triage, but let's say it
            // also ends up in inbox for starred channel)
            const threadReply = createMessage({
                id: 'thread-reply-001',
                author: colleague,
                content: 'Reply in existing thread',
                threadId: 'existing-thread',
                sourceChannel: channel,
                timestamp: new Date()
            });

            // A regular message also arrives
            const regularMsg = createMessage({
                id: 'regular-001',
                author: colleague,
                content: 'Regular channel message',
                sourceChannel: channel,
                timestamp: new Date(Date.now() + 1000)
            });

            harness.dispatchMessage(channel, threadReply);
            harness.dispatchMessage(channel, regularMsg);

            // Check initial state - thread reply goes to CONTEXT -> Triage
            const triageHasReply = harness.getBufferIds('triage').includes('thread-reply-001');
            expect(triageHasReply).toBe(true);

            // User reads the main channel (NOT the thread)
            harness.switchChannel(channel, { jumpTo: regularMsg.id });
            harness.markReadUpTo(channel, regularMsg);

            // Thread reply should STILL be in triage (reading channel doesn't clear it)
            expect(harness.getBufferIds('triage')).toContain('thread-reply-001');
        });

        it('inbox is empty after processing all items', () => {
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

            // Multiple messages arrive
            const msgs = [
                createMessage({
                    author: colleague,
                    content: 'First update',
                    sourceChannel: channel,
                    timestamp: new Date()
                }),
                createMessage({
                    author: colleague,
                    content: 'Second update',
                    sourceChannel: channel,
                    timestamp: new Date(Date.now() + 1000)
                }),
                createMessage({
                    author: colleague,
                    content: 'Third update',
                    sourceChannel: channel,
                    timestamp: new Date(Date.now() + 2000)
                })
            ];

            msgs.forEach(msg => harness.dispatchMessage(channel, msg));

            // All should be in inbox
            expect(harness.virtualCounts.inbox).toBe(3);

            // User goes to channel and reads to the end
            harness.switchChannel(channel);
            harness.jumpToBottom();
            harness.markReadUpTo(channel, msgs[msgs.length - 1]);

            // All should be purged
            expect(harness.virtualCounts.inbox).toBe(0);
        });
    });
});
