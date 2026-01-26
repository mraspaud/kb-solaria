// src/lib/stores/cursorPositioning.ts
// Cursor positioning strategies for channel navigation

import type { ChatWindow } from '../logic/ChatWindow';
import type { ChatBuffer } from '../logic/ChatBuffer';
import type { ChannelIdentity, Message, ChatState, UnreadState } from '../logic/types';
import { toMs } from '../utils/time';

export type CursorHint = 'unread' | 'bottom' | { jumpTo: string };
type JumpToHint = { jumpTo: string };

export interface CursorPositionResult {
    applied: boolean;
    actualUnreadCount?: number; // Set when unread hint recalculates count
}

/**
 * Find the index of the first unread message based on lastReadAt.
 * Falls back to unread count if lastReadAt is not available.
 */
export function findFirstUnreadIndex(
    channel: ChannelIdentity,
    buffer: ChatBuffer,
    messages: Map<string, Message>,
    unreadInfo: UnreadState | undefined
): number {
    if (buffer.messageIds.length === 0) {
        return -1;
    }

    // Primary: Use lastReadAt timestamp if available
    if (channel.lastReadAt) {
        const threshold = toMs(channel.lastReadAt);
        const idx = buffer.messageIds.findIndex(id => {
            const msg = messages.get(id);
            return msg && msg.timestamp.getTime() > threshold;
        });
        return idx;
    }

    // Fallback: Use unread count if available (for services without lastReadAt)
    if (unreadInfo && unreadInfo.count > 0) {
        const firstUnreadIdx = buffer.messageIds.length - unreadInfo.count;
        return Math.max(0, firstUnreadIdx);
    }

    // No lastReadAt and no unread count - assume all read
    return -1;
}

/**
 * Apply jumpTo hint - position cursor at specific message.
 */
export function applyJumpToHint(
    win: ChatWindow,
    buf: ChatBuffer,
    hint: JumpToHint,
    channel: ChannelIdentity,
    messages: Map<string, Message>
): void {
    const idx = buf.messageIds.indexOf(hint.jumpTo);
    if (idx !== -1) {
        win.cursorIndex = idx;
        win.isAttached = false;
        win.updateUnreadMarker(channel.lastReadAt, messages);
        win.pendingCursorHint = null;
        win.hasBeenVisited = true;
    } else if (buf.messageIds.length < 5) {
        // Buffer sparse - store pending hint for when history arrives
        win.pendingCursorHint = hint;
        win.isAttached = false;
        win.cursorIndex = Math.max(0, buf.messageIds.length - 1);
    } else {
        // Message not found in populated buffer - go to bottom
        win.cursorIndex = buf.messageIds.length - 1;
        win.isAttached = true;
        win.updateUnreadMarker(channel.lastReadAt, messages);
        win.pendingCursorHint = null;
        win.hasBeenVisited = true;
    }
}

/**
 * Apply unread hint - position at first unread message.
 * Returns the actual unread count for syncing with store.
 */
export function applyUnreadHint(
    win: ChatWindow,
    buf: ChatBuffer,
    channel: ChannelIdentity,
    messages: Map<string, Message>,
    unreadInfo: UnreadState | undefined
): number {
    if (buf.messageIds.length === 0) {
        win.pendingCursorHint = 'unread';
        win.isAttached = false;
        win.cursorIndex = -1;
        return 0;
    }

    const firstUnread = findFirstUnreadIndex(channel, buf, messages, unreadInfo);
    const actualUnreadCount = firstUnread >= 0 ? buf.messageIds.length - firstUnread : 0;

    if (firstUnread > 0) {
        win.cursorIndex = firstUnread - 1;
        win.isAttached = false;
        if (channel.lastReadAt) {
            win.updateUnreadMarker(channel.lastReadAt, messages);
        } else {
            win.unreadMarkerIndex = firstUnread - 1;
        }
    } else if (firstUnread === 0) {
        win.cursorIndex = 0;
        win.isAttached = false;
        win.unreadMarkerIndex = -2;
    } else {
        win.cursorIndex = Math.max(0, buf.messageIds.length - 1);
        win.isAttached = true;
        win.unreadMarkerIndex = -1;
    }

    win.pendingCursorHint = null;
    win.hasBeenVisited = true;

    return actualUnreadCount;
}

/**
 * Apply bottom hint - position at end of buffer.
 */
export function applyBottomHint(win: ChatWindow, buf: ChatBuffer): void {
    win.cursorIndex = Math.max(0, buf.messageIds.length - 1);
    win.isAttached = true;
    win.clearUnreadMarker();
    win.hasBeenVisited = true;
}

/**
 * Position cursor based on hint. Explicit hints (jumpTo, unread) are always honored.
 * Returns result indicating what was applied.
 */
export function positionCursor(
    win: ChatWindow,
    buf: ChatBuffer,
    channel: ChannelIdentity,
    cursorHint: CursorHint | undefined,
    messages: Map<string, Message>,
    unreadInfo: UnreadState | undefined
): CursorPositionResult {
    if (!win || !buf) {
        return { applied: false };
    }

    if (cursorHint && typeof cursorHint === 'object' && 'jumpTo' in cursorHint) {
        applyJumpToHint(win, buf, cursorHint, channel, messages);
        return { applied: true };
    }

    if (cursorHint === 'unread') {
        const actualUnreadCount = applyUnreadHint(win, buf, channel, messages, unreadInfo);
        return { applied: true, actualUnreadCount };
    }

    if (win.hasBeenVisited) {
        return { applied: false };
    }

    if (cursorHint === 'bottom') {
        applyBottomHint(win, buf);
        return { applied: true };
    }

    win.hasBeenVisited = true;
    return { applied: false };
}
