// src/lib/logic/ChatWindow.ts
import type { ChatBuffer } from './ChatBuffer';

export class ChatWindow {
    buffer: ChatBuffer;
    cursorIndex: number = -1;
    isAttached: boolean = true;
    
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
}
