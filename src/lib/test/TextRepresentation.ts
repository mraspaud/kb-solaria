// src/lib/test/TextRepresentation.ts
// Serialization helpers for readable test output and debugging

import type { Message, ChatState, UnreadState } from '../logic/types';

export interface MessageListOptions {
    includeTimestamps?: boolean;
    includeReactions?: boolean;
    includeBucket?: boolean;
    cursorIndex?: number;
    unreadMarkerIndex?: number;
    maxContentLength?: number;
}

/**
 * Serialize a message list to a readable text format
 *
 * Example output:
 * > [0] Alice: "Thread root" @10:00:00
 *   [1] Bob: "First reply" @10:05:00
 *   --- unread below ---
 *   [2] Me: "Second reply" @10:10:00
 */
export function serializeMessageList(
    messages: Message[],
    options: MessageListOptions = {}
): string {
    if (messages.length === 0) {
        return '(empty)';
    }

    const maxLen = options.maxContentLength || 40;
    const lines: string[] = [];

    messages.forEach((msg, idx) => {
        // Unread marker (before the message)
        if (options.unreadMarkerIndex === idx - 1 ||
            (options.unreadMarkerIndex === -2 && idx === 0)) {
            lines.push('  --- unread below ---');
        }

        const parts: string[] = [];

        // Cursor indicator
        parts.push(options.cursorIndex === idx ? '>' : ' ');

        // Index
        parts.push(`[${idx}]`);

        // Author
        parts.push(`${msg.author.name}:`);

        // Content (truncated)
        const content = msg.content.length > maxLen
            ? msg.content.slice(0, maxLen - 3) + '...'
            : msg.content;
        parts.push(`"${content}"`);

        // Optional: timestamp
        if (options.includeTimestamps) {
            const ts = msg.timestamp.toISOString().slice(11, 19);
            parts.push(`@${ts}`);
        }

        // Optional: bucket
        if (options.includeBucket && msg.bucket) {
            parts.push(`[${msg.bucket}]`);
        }

        // Thread indicator
        if (msg.threadId) {
            parts.push(`[T:${msg.threadId.slice(0, 8)}]`);
        }

        // Status indicator
        if (msg.status === 'pending') {
            parts.push('(pending)');
        }

        // Optional: reactions
        if (options.includeReactions && msg.reactions && Object.keys(msg.reactions).length > 0) {
            const rxns = Object.entries(msg.reactions)
                .map(([emoji, users]) => `${emoji}(${users.length})`)
                .join(' ');
            parts.push(`{${rxns}}`);
        }

        lines.push(parts.join(' '));
    });

    return lines.join('\n');
}

/**
 * Serialize a buffer (list of message IDs)
 */
export function serializeBuffer(ids: string[]): string {
    if (ids.length === 0) return '(empty)';
    return ids.map((id, i) => `[${i}] ${id}`).join('\n');
}

/**
 * Serialize virtual inbox/triage state with message contents
 */
export function serializeVirtualState(
    state: ChatState
): string {
    const lines: string[] = [];

    lines.push('=== VIRTUAL STATE ===');
    lines.push(`Triage: ${state.virtualCounts.triage} items`);
    lines.push(`Inbox:  ${state.virtualCounts.inbox} items`);
    lines.push('');

    // Get buffer contents
    const triageIds = state.buffers.get('triage') || [];
    const inboxIds = state.buffers.get('inbox') || [];

    if (triageIds.length > 0) {
        lines.push('--- Triage Buffer ---');
        triageIds.forEach((id, i) => {
            const msg = state.entities.messages.get(id);
            if (msg) {
                const src = msg.sourceChannel?.name || '?';
                const thread = msg.threadId ? ` [T:${msg.threadId.slice(0, 6)}]` : '';
                const content = msg.content.slice(0, 30);
                lines.push(`  [${i}] #${src}: "${content}"${thread}`);
            } else {
                lines.push(`  [${i}] ${id} (not found)`);
            }
        });
    }

    if (inboxIds.length > 0) {
        lines.push('--- Inbox Buffer ---');
        inboxIds.forEach((id, i) => {
            const msg = state.entities.messages.get(id);
            if (msg) {
                const src = msg.sourceChannel?.name || '?';
                const thread = msg.threadId ? ` [T:${msg.threadId.slice(0, 6)}]` : '';
                const content = msg.content.slice(0, 30);
                lines.push(`  [${i}] #${src}: "${content}"${thread}`);
            } else {
                lines.push(`  [${i}] ${id} (not found)`);
            }
        });
    }

    return lines.join('\n');
}

/**
 * Serialize unread state
 */
export function serializeUnreadState(
    unread: Record<string, UnreadState>
): string {
    const entries = Object.entries(unread);
    if (entries.length === 0) return '(no unread)';

    return entries
        .map(([channelId, state]) => {
            const mention = state.hasMention ? ' [MENTION]' : '';
            return `${channelId}: ${state.count}${mention}`;
        })
        .join('\n');
}

/**
 * Full state dump for debugging failed tests
 */
export function dumpState(state: ChatState): string {
    const lines: string[] = [];

    lines.push('========== STATE DUMP ==========');
    lines.push(`Active Channel: ${state.activeChannel.id} (${state.activeChannel.name})`);
    lines.push(`  isThread: ${state.activeChannel.isThread || false}`);
    if (state.activeChannel.parentChannel) {
        lines.push(`  parentChannel: ${state.activeChannel.parentChannel.id}`);
    }
    lines.push(`Cursor: ${state.cursorIndex}, Attached: ${state.isAttached}`);
    lines.push(`Unread Marker: ${state.unreadMarkerIndex}`);
    lines.push('');

    lines.push('--- Current View ---');
    lines.push(serializeMessageList(state.messages, {
        cursorIndex: state.cursorIndex,
        unreadMarkerIndex: state.unreadMarkerIndex,
        includeBucket: true,
        includeTimestamps: true
    }));
    lines.push('');

    lines.push('--- Virtual Counts ---');
    lines.push(`Triage: ${state.virtualCounts.triage}`);
    lines.push(`Inbox: ${state.virtualCounts.inbox}`);
    lines.push('');

    lines.push('--- Unread State ---');
    lines.push(serializeUnreadState(state.unread));
    lines.push('');

    lines.push('--- Participated Threads ---');
    lines.push(Array.from(state.participatedThreads).join(', ') || '(none)');
    lines.push('');

    lines.push('--- Available Channels ---');
    state.availableChannels.forEach(ch => {
        const starred = ch.starred ? ' ★' : '';
        lines.push(`  ${ch.id}: ${ch.name} [${ch.service.name}]${starred}`);
    });

    lines.push('================================');

    return lines.join('\n');
}

/**
 * Compare two states and show differences (useful for debugging)
 */
export function diffStates(
    label1: string,
    state1: ChatState,
    label2: string,
    state2: ChatState
): string {
    const lines: string[] = [];

    lines.push(`=== DIFF: ${label1} vs ${label2} ===`);

    if (state1.activeChannel.id !== state2.activeChannel.id) {
        lines.push(`Active Channel: ${state1.activeChannel.id} → ${state2.activeChannel.id}`);
    }

    if (state1.cursorIndex !== state2.cursorIndex) {
        lines.push(`Cursor: ${state1.cursorIndex} → ${state2.cursorIndex}`);
    }

    if (state1.virtualCounts.triage !== state2.virtualCounts.triage) {
        lines.push(`Triage: ${state1.virtualCounts.triage} → ${state2.virtualCounts.triage}`);
    }

    if (state1.virtualCounts.inbox !== state2.virtualCounts.inbox) {
        lines.push(`Inbox: ${state1.virtualCounts.inbox} → ${state2.virtualCounts.inbox}`);
    }

    if (state1.messages.length !== state2.messages.length) {
        lines.push(`Messages: ${state1.messages.length} → ${state2.messages.length}`);
    }

    if (lines.length === 1) {
        lines.push('(no differences detected)');
    }

    return lines.join('\n');
}
