/**
 * Message filter predicates for consistent filtering logic across the codebase.
 */

import type { Message } from './types';

/** Check if a message belongs to a specific thread */
export const isInThread = (msg: Message, threadRootId: string): boolean =>
    msg.id === threadRootId || msg.threadId === threadRootId;

/** Check if a message belongs to a specific channel */
export const belongsToChannel = (msg: Message, channelId: string): boolean =>
    (msg.sourceChannel?.id || channelId) === channelId;

/** Check if a message timestamp is after a given message */
export const isAfterMessage = (msg: Message, reference: Message): boolean =>
    msg.timestamp.getTime() > reference.timestamp.getTime();

/** Check if a message timestamp is after a threshold (in ms) */
export const isAfterTimestampMs = (msg: Message, thresholdMs: number): boolean =>
    msg.timestamp.getTime() > thresholdMs;
