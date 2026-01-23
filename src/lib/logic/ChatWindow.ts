// src/lib/logic/ChatWindow.ts
import type { ChatBuffer } from './ChatBuffer';
import type { Message } from './types';

export type PendingCursorHint = 'unread' | 'bottom' | { jumpTo: string } | null;

export class ChatWindow {
    buffer: ChatBuffer;
    cursorIndex: number = -1;
    isAttached: boolean = true;
    unreadMarkerIndex: number = -1; // -1 = none, -2 = first msg is unread
    hasBeenVisited: boolean = false; // True after first navigation to this channel
    pendingCursorHint: PendingCursorHint = null; // Set when buffer is empty, applied when messages arrive

    // Sticky selection ID
    private lastSelectedId: string | null = null;

    constructor(buffer: ChatBuffer) {
        this.buffer = buffer;
        this.buffer.subscribe(() => this.onBufferUpdate());
    }

    moveCursor(delta: number) {
        const maxIndex = this.buffer.messageIds.length - 1;
        if (maxIndex < 0) return;
        
        const newIndex = Math.max(0, Math.min(this.cursorIndex + delta, maxIndex));
        this.cursorIndex = newIndex;
        
        this.lastSelectedId = this.buffer.messageIds[newIndex] || null;

        this.isAttached = (this.cursorIndex === maxIndex);
    }

    detach() {
        this.isAttached = false;
        if (this.cursorIndex >= 0 && this.buffer.messageIds[this.cursorIndex]) {
            this.lastSelectedId = this.buffer.messageIds[this.cursorIndex];
        }
    }

    jumpToBottom() {
        const maxIndex = this.buffer.messageIds.length - 1;
        if (maxIndex >= 0) {
            this.cursorIndex = maxIndex;
            this.lastSelectedId = this.buffer.messageIds[maxIndex];
            this.isAttached = true;
        }
    }

    private onBufferUpdate() {
        const maxIndex = this.buffer.messageIds.length - 1;

        if (this.isAttached) {
            // Auto-follow mode
            this.cursorIndex = maxIndex;
            this.lastSelectedId = this.buffer.messageIds[maxIndex] || null;
        } else {
            // Detached/History Mode: Try to stick to the specific message ID
            if (this.lastSelectedId) {
                const newIndex = this.buffer.messageIds.indexOf(this.lastSelectedId);

                if (newIndex !== -1) {
                    // Found it! Stick to it.
                    this.cursorIndex = newIndex;
                } else {
                    // Message removed? Clamp cursor.
                    this.cursorIndex = Math.min(this.cursorIndex, maxIndex);
                    this.lastSelectedId = this.buffer.messageIds[this.cursorIndex] || null;
                }
            }
        }
    }

    /**
     * Update the unread marker based on lastReadAt timestamp.
     * @param lastReadAt Unix timestamp in seconds (or undefined if never read)
     * @param messages Map of message entities to look up timestamps
     */
    updateUnreadMarker(lastReadAt: number | undefined, messages: Map<string, Message>): void {
        if (!lastReadAt) {
            this.unreadMarkerIndex = -1;
            return;
        }

        const threshold = lastReadAt * 1000; // Convert to ms
        const firstUnreadIdx = this.buffer.messageIds.findIndex(id => {
            const msg = messages.get(id);
            return msg && msg.timestamp.getTime() > threshold;
        });

        if (firstUnreadIdx === -1) {
            this.unreadMarkerIndex = -1; // All read
        } else if (firstUnreadIdx === 0) {
            this.unreadMarkerIndex = -2; // First message is unread
        } else {
            this.unreadMarkerIndex = firstUnreadIdx - 1; // Marker at last read
        }
    }

    /**
     * Update marker high water mark as cursor moves forward
     */
    updateUnreadMarkerHighWater(cursorIndex: number): void {
        if (this.unreadMarkerIndex === -1) return;

        // Move marker forward as cursor passes it
        if (cursorIndex > this.unreadMarkerIndex) {
            this.unreadMarkerIndex = cursorIndex;
        }

        // Clear marker if at or past end
        if (this.unreadMarkerIndex >= this.buffer.messageIds.length - 1) {
            this.unreadMarkerIndex = -1;
        }
    }

    /**
     * Clear the unread marker (when reaching bottom)
     */
    clearUnreadMarker(): void {
        this.unreadMarkerIndex = -1;
    }
}
