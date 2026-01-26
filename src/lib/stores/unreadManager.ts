// src/lib/stores/unreadManager.ts
// Unread state management logic

import type { ChannelIdentity, UnreadState } from '../logic/types';
import { Bucket } from '../logic/types';

/**
 * Get unread state for a channel with defaults.
 */
export function getUnreadState(
    unread: Record<string, UnreadState>,
    channelId: string
): UnreadState {
    return unread[channelId] || { count: 0, hasMention: false };
}

/**
 * Build updated unread state for a new message.
 * Returns the original unread if no update is needed.
 */
export function buildUpdatedUnread(
    unread: Record<string, UnreadState>,
    activeChannelId: string,
    channel: ChannelIdentity,
    isMe: boolean,
    verdict: Bucket
): Record<string, UnreadState> {
    // Don't increment unread for: active channel, own messages, or noise
    if (channel.id === activeChannelId || isMe || verdict === Bucket.NOISE) {
        return unread;
    }

    const current = getUnreadState(unread, channel.id);
    return {
        ...unread,
        [channel.id]: {
            count: current.count + 1,
            hasMention: current.hasMention || verdict === Bucket.EGO
        }
    };
}

/**
 * Merge new unread state (from server) with existing state.
 * Takes the max of counts and ORs the mention flags.
 */
export function mergeUnreadState(
    unread: Record<string, UnreadState>,
    channelId: string,
    count: number,
    hasMention: boolean
): Record<string, UnreadState> {
    const current = getUnreadState(unread, channelId);
    return {
        ...unread,
        [channelId]: {
            count: Math.max(current.count, count),
            hasMention: current.hasMention || hasMention
        }
    };
}

/**
 * Clear unread count for a channel.
 */
export function clearUnread(
    unread: Record<string, UnreadState>,
    channelId: string
): Record<string, UnreadState> {
    const newUnread = { ...unread };
    delete newUnread[channelId];
    return newUnread;
}
