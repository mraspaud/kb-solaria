// src/lib/test/fixtures.ts
// Factory functions for creating test data with deterministic IDs

import type { ServiceIdentity, UserIdentity, ChannelIdentity, Message } from '../logic/types';

let idCounter = 0;

/**
 * Reset the ID counter for deterministic tests
 */
export function resetIdCounter() {
    idCounter = 0;
}

/**
 * Create a service identity
 */
export function createService(name = 'TestService'): ServiceIdentity {
    return {
        id: `svc-${++idCounter}`,
        name
    };
}

/**
 * Create a user identity
 */
export function createUser(name = 'User', serviceId?: string): UserIdentity {
    return {
        id: `user-${++idCounter}`,
        name,
        serviceId,
        color: '#7E9CD8'
    };
}

/**
 * Create a channel identity
 */
export function createChannel(opts: {
    name?: string;
    service?: ServiceIdentity;
    starred?: boolean;
    lastReadAt?: number;
    lastPostAt?: number;
    category?: 'channel' | 'direct' | 'group';
    mass?: number;
} = {}): ChannelIdentity {
    const service = opts.service || createService();
    return {
        id: `ch-${++idCounter}`,
        name: opts.name || `test-channel-${idCounter}`,
        service,
        starred: opts.starred,
        lastReadAt: opts.lastReadAt,
        lastPostAt: opts.lastPostAt,
        category: opts.category || 'channel',
        mass: opts.mass
    };
}

/**
 * Create a thread channel from a root message
 */
export function createThreadChannel(
    rootMsgId: string,
    parentChannel: ChannelIdentity
): ChannelIdentity {
    return {
        id: `thread_${rootMsgId}`,
        name: 'Thread',
        service: parentChannel.service,
        isThread: true,
        parentChannel,
        threadId: rootMsgId
    };
}

/**
 * Create a message
 */
export function createMessage(opts: {
    id?: string;
    author?: UserIdentity;
    content?: string;
    timestamp?: Date;
    threadId?: string;
    sourceChannel?: ChannelIdentity;
    reactions?: Record<string, string[]>;
    replyCount?: number;
    status?: 'pending' | 'sent' | 'failed';
} = {}): Message {
    const msgId = opts.id || `msg-${++idCounter}`;
    return {
        id: msgId,
        author: opts.author || createUser(),
        content: opts.content || `Test message ${msgId}`,
        timestamp: opts.timestamp || new Date(),
        threadId: opts.threadId,
        sourceChannel: opts.sourceChannel,
        reactions: opts.reactions || {},
        replyCount: opts.replyCount,
        status: opts.status
    };
}

/**
 * Create multiple messages with sequential timestamps
 */
export function createMessages(count: number, opts: {
    channel?: ChannelIdentity;
    author?: UserIdentity;
    baseTime?: Date;
    intervalMs?: number;
    threadId?: string;
} = {}): Message[] {
    const channel = opts.channel;
    const author = opts.author || createUser('BatchAuthor');
    const baseTime = opts.baseTime || new Date();
    const interval = opts.intervalMs || 60000; // 1 minute default

    return Array.from({ length: count }, (_, i) => createMessage({
        author,
        content: `Message ${i + 1} of ${count}`,
        timestamp: new Date(baseTime.getTime() + i * interval),
        sourceChannel: channel,
        threadId: opts.threadId
    }));
}

/**
 * Standard test fixtures for common scenarios
 */
export const fixtures = {
    /** Standard Slack-like service */
    slackService: { id: 'slack', name: 'Slack' } as ServiceIdentity,

    /** Standard Mattermost-like service */
    mattermostService: { id: 'mattermost', name: 'Mattermost' } as ServiceIdentity,

    /** Internal aggregation service (for triage/inbox) */
    aggregationService: { id: 'aggregation', name: 'Solaria' } as ServiceIdentity,

    /** Triage channel */
    triageChannel: {
        id: 'triage',
        name: 'triage',
        service: { id: 'aggregation', name: 'Solaria' }
    } as ChannelIdentity,

    /** Inbox channel */
    inboxChannel: {
        id: 'inbox',
        name: 'inbox',
        service: { id: 'aggregation', name: 'Solaria' }
    } as ChannelIdentity,

    /** System channel */
    systemChannel: {
        id: 'system',
        name: 'system',
        service: { id: 'internal', name: 'Solaria' }
    } as ChannelIdentity
};
