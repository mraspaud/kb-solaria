import type { ChatBuffer } from './ChatBuffer';

export class ChatWindow {
    buffer: ChatBuffer;
    cursorIndex: number = -1;
    isAttached: boolean = true;

    constructor(buffer: ChatBuffer) {
        this.buffer = buffer;
        this.buffer.subscribe(() => this.onBufferUpdate());
    }

    moveCursor(delta: number) {
        const maxIndex = this.buffer.messages.length - 1;
        
        // Prevent moving if empty
        if (maxIndex < 0) return;

        // Calculate new position
        const newIndex = Math.max(0, Math.min(this.cursorIndex + delta, maxIndex));
        
        this.cursorIndex = newIndex;

        // Logic: If we touched the bottom, we attach. Otherwise, we detach.
        this.isAttached = (this.cursorIndex === maxIndex);
    }

    detach() {
        this.isAttached = false;
    }

    jumpToBottom() {
        const maxIndex = this.buffer.messages.length - 1;
        if (maxIndex >= 0) {
            this.cursorIndex = maxIndex;
            this.isAttached = true;
        }
    }

    private onBufferUpdate() {
        const maxIndex = this.buffer.messages.length - 1;
        
        if (this.isAttached) {
            // Auto-follow: set cursor to the new last message
            this.cursorIndex = maxIndex;
        }
        // If detached, we do nothing (cursor stays where it is)
    }
}
