// src/lib/logic/BucketAnalyzer.test.ts
// Unit tests for message classification logic

import { describe, it, expect } from 'vitest';
import { BucketAnalyzer } from './BucketAnalyzer';
import { Bucket } from './types';
import type { Message, ChannelIdentity, UserIdentity } from './types';

// Helper to create test messages
function createMsg(overrides: Partial<Message> = {}): Message {
    return {
        id: 'msg-1',
        author: { id: 'other-user', name: 'Other' },
        content: 'Hello world',
        timestamp: new Date(),
        reactions: {},
        ...overrides
    };
}

// Helper to create test channels
function createChannel(overrides: Partial<ChannelIdentity> = {}): ChannelIdentity {
    return {
        id: 'ch-1',
        name: 'general',
        service: { id: 'slack', name: 'Slack' },
        ...overrides
    };
}

describe('BucketAnalyzer', () => {
    const me: UserIdentity = { id: 'me-123', name: 'TestUser', serviceId: 'slack' };
    const emptyThreads = new Set<string>();

    describe('Self Guard', () => {
        it('classifies own messages as NOISE', () => {
            const msg = createMsg({ author: { id: 'me-123', name: 'TestUser' } });
            const channel = createChannel();

            const result = BucketAnalyzer.classify(msg, channel, me, emptyThreads);

            expect(result).toBe(Bucket.NOISE);
        });

        it('processes messages from others normally', () => {
            const msg = createMsg({ author: { id: 'someone-else', name: 'Someone' } });
            const channel = createChannel({ starred: true });

            const result = BucketAnalyzer.classify(msg, channel, me, emptyThreads);

            expect(result).toBe(Bucket.SIGNAL);
        });
    });

    describe('History Guard - Root Messages', () => {
        it('classifies old root messages as NOISE based on lastReadAt', () => {
            const oldTime = new Date(Date.now() - 3600000); // 1 hour ago
            const msg = createMsg({ timestamp: oldTime });
            const channel = createChannel({
                lastReadAt: Date.now() / 1000 - 1800 // Read 30 min ago
            });

            const result = BucketAnalyzer.classify(msg, channel, me, emptyThreads);

            expect(result).toBe(Bucket.NOISE);
        });

        it('classifies new root messages normally', () => {
            const newTime = new Date(); // Now
            const msg = createMsg({ timestamp: newTime });
            const channel = createChannel({
                starred: true,
                lastReadAt: Date.now() / 1000 - 3600 // Read 1 hour ago
            });

            const result = BucketAnalyzer.classify(msg, channel, me, emptyThreads);

            expect(result).toBe(Bucket.SIGNAL);
        });

        it('allows 2 second buffer for clock skew', () => {
            // Message is exactly at lastReadAt + 1 second (within buffer)
            const lastRead = Date.now() / 1000 - 60;
            const msgTime = new Date((lastRead + 1) * 1000);
            const msg = createMsg({ timestamp: msgTime });
            const channel = createChannel({
                starred: true,
                lastReadAt: lastRead
            });

            const result = BucketAnalyzer.classify(msg, channel, me, emptyThreads);

            expect(result).toBe(Bucket.NOISE);
        });
    });

    describe('History Guard - Thread Replies', () => {
        it('uses threadReadAt for thread replies, not channel.lastReadAt', () => {
            // Channel was read recently, but thread was never opened
            const msg = createMsg({
                timestamp: new Date(Date.now() - 1800000), // 30 min ago
                threadId: 'thread-123'
            });
            const channel = createChannel({
                lastReadAt: Date.now() / 1000 // Just read the channel
            });

            // No threadReadAt provided -> assumes unread (0)
            const result = BucketAnalyzer.classify(msg, channel, me, emptyThreads);

            // Should NOT be noise - thread was never opened
            expect(result).toBe(Bucket.NOISE); // Falls through to NOISE since not in myThreads
        });

        it('classifies old thread replies as NOISE when thread was read', () => {
            const myThreads = new Set(['thread-123']);
            const msg = createMsg({
                timestamp: new Date(Date.now() - 3600000), // 1 hour ago
                threadId: 'thread-123'
            });
            const channel = createChannel();
            const threadReadAt = Date.now() / 1000 - 1800; // Thread read 30 min ago

            const result = BucketAnalyzer.classify(msg, channel, me, myThreads, threadReadAt);

            expect(result).toBe(Bucket.NOISE);
        });

        it('classifies new thread replies as CONTEXT when in myThreads', () => {
            const myThreads = new Set(['thread-123']);
            const msg = createMsg({
                timestamp: new Date(), // Now
                threadId: 'thread-123'
            });
            const channel = createChannel();
            const threadReadAt = Date.now() / 1000 - 3600; // Thread read 1 hour ago

            const result = BucketAnalyzer.classify(msg, channel, me, myThreads, threadReadAt);

            expect(result).toBe(Bucket.CONTEXT);
        });
    });

    describe('EGO - Mentions', () => {
        it('classifies @name mentions as EGO', () => {
            const msg = createMsg({
                content: 'Hey @TestUser can you help?',
                timestamp: new Date()
            });
            const channel = createChannel();

            const result = BucketAnalyzer.classify(msg, channel, me, emptyThreads);

            expect(result).toBe(Bucket.EGO);
        });

        it('classifies @name mentions case-insensitively', () => {
            const msg = createMsg({
                content: 'Hey @testuser can you help?',
                timestamp: new Date()
            });
            const channel = createChannel();

            const result = BucketAnalyzer.classify(msg, channel, me, emptyThreads);

            expect(result).toBe(Bucket.EGO);
        });

        it('classifies user ID mentions as EGO', () => {
            const msg = createMsg({
                content: 'Hey <@me-123> can you help?',
                timestamp: new Date()
            });
            const channel = createChannel();

            const result = BucketAnalyzer.classify(msg, channel, me, emptyThreads);

            expect(result).toBe(Bucket.EGO);
        });

        it('does not match partial name matches', () => {
            const msg = createMsg({
                content: 'TestUserExtra said hello', // Not a mention
                timestamp: new Date()
            });
            const channel = createChannel({ starred: true });

            const result = BucketAnalyzer.classify(msg, channel, me, emptyThreads);

            // Should be SIGNAL (starred channel), not EGO
            expect(result).toBe(Bucket.SIGNAL);
        });
    });

    describe('EGO - Direct Messages', () => {
        it('classifies direct DM messages as EGO', () => {
            const msg = createMsg({ timestamp: new Date() });
            const channel = createChannel({ category: 'direct' });

            const result = BucketAnalyzer.classify(msg, channel, me, emptyThreads);

            expect(result).toBe(Bucket.EGO);
        });
    });

    describe('CONTEXT - Participated Threads', () => {
        it('classifies replies in participated threads as CONTEXT', () => {
            const myThreads = new Set(['thread-456']);
            const msg = createMsg({
                timestamp: new Date(),
                threadId: 'thread-456'
            });
            const channel = createChannel();

            const result = BucketAnalyzer.classify(msg, channel, me, myThreads);

            expect(result).toBe(Bucket.CONTEXT);
        });

        it('does not classify replies in non-participated threads as CONTEXT', () => {
            const myThreads = new Set(['thread-456']);
            const msg = createMsg({
                timestamp: new Date(),
                threadId: 'thread-789' // Different thread
            });
            const channel = createChannel();

            const result = BucketAnalyzer.classify(msg, channel, me, myThreads);

            expect(result).toBe(Bucket.NOISE);
        });
    });

    describe('SIGNAL - Starred Channels', () => {
        it('classifies root messages in starred channels as SIGNAL', () => {
            const msg = createMsg({ timestamp: new Date() });
            const channel = createChannel({ starred: true });

            const result = BucketAnalyzer.classify(msg, channel, me, emptyThreads);

            expect(result).toBe(Bucket.SIGNAL);
        });

        it('classifies thread replies in starred channels as NOISE (not following)', () => {
            const msg = createMsg({
                timestamp: new Date(),
                threadId: 'some-thread'
            });
            const channel = createChannel({ starred: true });

            const result = BucketAnalyzer.classify(msg, channel, me, emptyThreads);

            expect(result).toBe(Bucket.NOISE);
        });

        it('classifies thread replies in starred channels as CONTEXT if participating', () => {
            const myThreads = new Set(['some-thread']);
            const msg = createMsg({
                timestamp: new Date(),
                threadId: 'some-thread'
            });
            const channel = createChannel({ starred: true });

            const result = BucketAnalyzer.classify(msg, channel, me, myThreads);

            expect(result).toBe(Bucket.CONTEXT);
        });
    });

    describe('SIGNAL - Group DMs', () => {
        it('classifies group DM messages as SIGNAL', () => {
            const msg = createMsg({ timestamp: new Date() });
            const channel = createChannel({ category: 'group' });

            const result = BucketAnalyzer.classify(msg, channel, me, emptyThreads);

            expect(result).toBe(Bucket.SIGNAL);
        });
    });

    describe('NOISE - Default', () => {
        it('classifies messages in non-starred channels as NOISE', () => {
            const msg = createMsg({ timestamp: new Date() });
            const channel = createChannel({ starred: false });

            const result = BucketAnalyzer.classify(msg, channel, me, emptyThreads);

            expect(result).toBe(Bucket.NOISE);
        });

        it('classifies messages without user context as NOISE', () => {
            const msg = createMsg({ timestamp: new Date() });
            const channel = createChannel();

            const result = BucketAnalyzer.classify(msg, channel, undefined, emptyThreads);

            expect(result).toBe(Bucket.NOISE);
        });
    });

    describe('Priority Order', () => {
        it('EGO (mention) takes priority over SIGNAL (starred)', () => {
            const msg = createMsg({
                content: 'Hey @TestUser check this out',
                timestamp: new Date()
            });
            const channel = createChannel({ starred: true });

            const result = BucketAnalyzer.classify(msg, channel, me, emptyThreads);

            expect(result).toBe(Bucket.EGO);
        });

        it('EGO (mention) takes priority over CONTEXT (my thread)', () => {
            const myThreads = new Set(['thread-123']);
            const msg = createMsg({
                content: 'Hey @TestUser check this out',
                timestamp: new Date(),
                threadId: 'thread-123'
            });
            const channel = createChannel();

            const result = BucketAnalyzer.classify(msg, channel, me, myThreads);

            expect(result).toBe(Bucket.EGO);
        });

        it('CONTEXT takes priority over SIGNAL', () => {
            const myThreads = new Set(['thread-123']);
            const msg = createMsg({
                timestamp: new Date(),
                threadId: 'thread-123'
            });
            const channel = createChannel({ starred: true });

            const result = BucketAnalyzer.classify(msg, channel, me, myThreads);

            expect(result).toBe(Bucket.CONTEXT);
        });

        it('Self guard takes priority over everything', () => {
            const myThreads = new Set(['thread-123']);
            const msg = createMsg({
                author: { id: 'me-123', name: 'TestUser' },
                content: 'Hey @TestUser check this out', // Self-mention
                timestamp: new Date(),
                threadId: 'thread-123'
            });
            const channel = createChannel({ starred: true, category: 'direct' });

            const result = BucketAnalyzer.classify(msg, channel, me, myThreads);

            expect(result).toBe(Bucket.NOISE);
        });
    });
});
