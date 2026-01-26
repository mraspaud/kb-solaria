// src/lib/test/scenarios/triage-workflow.test.ts
// Behavior tests for triage workflow: "I process my mentions and thread replies"

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

describe('Triage Workflow', () => {
    let harness: TestHarness;
    const service = { id: 'slack', name: 'Slack' };

    beforeEach(() => {
        resetIdCounter();
        harness = new TestHarness();
    });

    describe('Mention handling', () => {
        it('mention disappears from triage after reading in source channel', () => {
            // Setup: A mention in a regular (non-starred) channel
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

            // A mention arrives -> EGO bucket -> Triage
            const mention = createMessage({
                author: colleague,
                content: `Hey <@${me.id}>, can you review this PR?`,
                sourceChannel: channel,
                timestamp: new Date()
            });
            harness.dispatchMessage(channel, mention);

            // Verify: Mention should be in triage
            expect(harness.virtualCounts.triage).toBe(1);
            expect(harness.getBufferIds('triage')).toContain(mention.id);

            // Action: User jumps to source channel and reads it
            harness.switchChannel(channel, { jumpTo: mention.id });
            harness.markReadUpTo(channel, mention);

            // Assert: Mention should be gone from triage
            expect(harness.virtualCounts.triage).toBe(0);
            expect(harness.getBufferIds('triage')).not.toContain(mention.id);
        });

        it('multiple mentions from same channel purged together when reading to end', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const bob = createUser('Bob');
            const channel = createChannel({
                name: 'dev',
                service,
                starred: false,
                lastReadAt: Date.now() / 1000 - 3600
            });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            // Multiple mentions arrive in the same channel
            const mention1 = createMessage({
                author: alice,
                content: `<@${me.id}> first question`,
                sourceChannel: channel,
                timestamp: new Date()
            });
            const mention2 = createMessage({
                author: bob,
                content: `<@${me.id}> second question`,
                sourceChannel: channel,
                timestamp: new Date(Date.now() + 1000)
            });

            harness.dispatchMessage(channel, mention1);
            harness.dispatchMessage(channel, mention2);

            // Both should be in triage
            expect(harness.virtualCounts.triage).toBe(2);

            // Read to the end of the channel
            harness.switchChannel(channel);
            harness.jumpToBottom();
            harness.markReadUpTo(channel, mention2);

            // Both mentions should be purged
            expect(harness.virtualCounts.triage).toBe(0);
        });
    });

    describe('Thread reply handling', () => {
        it('thread reply disappears from triage after reading the thread', () => {
            // Setup: User has participated in a thread
            const me = createUser('Me', 'slack');
            const colleague = createUser('Colleague');
            const channel = createChannel({
                name: 'engineering',
                service,
                starred: false,
                lastReadAt: Date.now() / 1000 - 3600
            });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel],
                participatedThreads: ['existing-thread']
            });

            // A reply arrives in a thread I participated in -> CONTEXT -> Triage
            const reply = createMessage({
                id: 'thread-reply-001',
                author: colleague,
                content: 'Thanks for the review, fixed!',
                threadId: 'existing-thread',
                sourceChannel: channel,
                timestamp: new Date()
            });
            harness.dispatchMessage(channel, reply);

            // Verify: Reply should be in triage
            expect(harness.virtualCounts.triage).toBe(1);
            expect(harness.getBufferIds('triage')).toContain('thread-reply-001');

            // Action: User opens the thread and reads it
            const threadChannel = createThreadChannel('existing-thread', channel);
            harness.switchChannel(threadChannel);
            harness.dispatchMessage(threadChannel, reply);
            harness.jumpToBottom();
            harness.markReadUpTo(threadChannel, reply);

            // Assert: Reply should be gone from triage
            expect(harness.getBufferIds('triage')).not.toContain('thread-reply-001');
        });

        it('thread reply stays in triage if I only read the main channel', () => {
            // This is the edge case: reading the channel shouldn't purge thread replies
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
                channels: [channel],
                participatedThreads: ['my-thread']
            });

            // Thread reply arrives
            const threadReply = createMessage({
                id: 'thread-reply-002',
                author: colleague,
                content: 'Reply in thread I participated in',
                threadId: 'my-thread',
                sourceChannel: channel,
                timestamp: new Date()
            });

            // Regular message also arrives
            const regularMsg = createMessage({
                id: 'regular-msg-001',
                author: colleague,
                content: 'Just a regular message',
                sourceChannel: channel,
                timestamp: new Date(Date.now() + 1000)
            });

            harness.dispatchMessage(channel, threadReply);
            harness.dispatchMessage(channel, regularMsg);

            // Thread reply should be in triage
            expect(harness.getBufferIds('triage')).toContain('thread-reply-002');

            // User reads the main channel (not the thread)
            harness.switchChannel(channel);
            harness.jumpToBottom();
            harness.markReadUpTo(channel, regularMsg);

            // Thread reply should STILL be in triage
            expect(harness.getBufferIds('triage')).toContain('thread-reply-002');
        });
    });

    describe('Mixed triage scenarios', () => {
        it('mention and thread reply can coexist and be processed independently', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const bob = createUser('Bob');

            const channel1 = createChannel({
                name: 'frontend',
                service,
                starred: false,
                lastReadAt: Date.now() / 1000 - 3600
            });
            const channel2 = createChannel({
                name: 'backend',
                service,
                starred: false,
                lastReadAt: Date.now() / 1000 - 3600
            });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel1, channel2],
                participatedThreads: ['backend-thread']
            });

            // Mention in channel1
            const mention = createMessage({
                id: 'mention-001',
                author: alice,
                content: `<@${me.id}> can you check this?`,
                sourceChannel: channel1,
                timestamp: new Date()
            });

            // Thread reply in channel2
            const threadReply = createMessage({
                id: 'reply-001',
                author: bob,
                content: 'Fixed the backend issue',
                threadId: 'backend-thread',
                sourceChannel: channel2,
                timestamp: new Date(Date.now() + 500)
            });

            harness.dispatchMessage(channel1, mention);
            harness.dispatchMessage(channel2, threadReply);

            // Both should be in triage
            expect(harness.virtualCounts.triage).toBe(2);

            // Process only the mention
            harness.switchChannel(channel1, { jumpTo: 'mention-001' });
            harness.markReadUpTo(channel1, mention);

            // Mention gone, thread reply remains
            expect(harness.getBufferIds('triage')).not.toContain('mention-001');
            expect(harness.getBufferIds('triage')).toContain('reply-001');
            expect(harness.virtualCounts.triage).toBe(1);

            // Now process the thread reply
            const threadChannel = createThreadChannel('backend-thread', channel2);
            harness.switchChannel(threadChannel);
            harness.dispatchMessage(threadChannel, threadReply);
            harness.jumpToBottom();
            harness.markReadUpTo(threadChannel, threadReply);

            // All clear
            expect(harness.virtualCounts.triage).toBe(0);
        });

        it('triage is empty after processing all items', () => {
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

            // Multiple mentions arrive
            const msgs = [
                createMessage({
                    author: colleague,
                    content: `<@${me.id}> first`,
                    sourceChannel: channel,
                    timestamp: new Date()
                }),
                createMessage({
                    author: colleague,
                    content: `<@${me.id}> second`,
                    sourceChannel: channel,
                    timestamp: new Date(Date.now() + 1000)
                }),
                createMessage({
                    author: colleague,
                    content: `<@${me.id}> third`,
                    sourceChannel: channel,
                    timestamp: new Date(Date.now() + 2000)
                })
            ];

            msgs.forEach(msg => harness.dispatchMessage(channel, msg));

            expect(harness.virtualCounts.triage).toBe(3);

            // Read to end
            harness.switchChannel(channel);
            harness.jumpToBottom();
            harness.markReadUpTo(channel, msgs[msgs.length - 1]);

            // All purged
            expect(harness.virtualCounts.triage).toBe(0);
        });
    });
});
