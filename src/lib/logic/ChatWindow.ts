import type { ChatBuffer } from './ChatBuffer';

export class ChatWindow {
    buffer: ChatBuffer;
    cursorIndex: number = -1;
    isAttached: boolean = true;
    
    // NEW: Track the ID to maintain sticky selection during history loads
    private lastSelectedId: string | null = null;

    constructor(buffer: ChatBuffer) {
        this.buffer = buffer;
        this.buffer.subscribe(() => this.onBufferUpdate());
    }

    moveCursor(delta: number) {
        const maxIndex = this.buffer.messages.length - 1;
        if (maxIndex < 0) return;
        
        const newIndex = Math.max(0, Math.min(this.cursorIndex + delta, maxIndex));
        this.cursorIndex = newIndex;
        
        // Track the ID of the message we just moved to
        this.lastSelectedId = this.buffer.messages[newIndex]?.id || null;

        this.isAttached = (this.cursorIndex === maxIndex);
    }

    detach() {
        this.isAttached = false;
        // Ensure we track where we detached
        if (this.cursorIndex >= 0 && this.buffer.messages[this.cursorIndex]) {
            this.lastSelectedId = this.buffer.messages[this.cursorIndex].id;
        }
    }

    jumpToBottom() {
        const maxIndex = this.buffer.messages.length - 1;
        if (maxIndex >= 0) {
            this.cursorIndex = maxIndex;
            this.lastSelectedId = this.buffer.messages[maxIndex].id;
            this.isAttached = true;
        }
    }

    private onBufferUpdate() {
        const maxIndex = this.buffer.messages.length - 1;
        
        if (this.isAttached) {
            // Auto-follow mode
            this.cursorIndex = maxIndex;
            this.lastSelectedId = this.buffer.messages[maxIndex]?.id || null;
        } else {
            // Detached/History Mode: Try to stick to the specific message
            if (this.lastSelectedId) {
                // Find where our message went
                const newIndex = this.buffer.messages.findIndex(m => m.id === this.lastSelectedId);
                
                if (newIndex !== -1) {
                    // Found it! Update cursor to follow the message
                    this.cursorIndex = newIndex;
                } else {
                    // Message disappeared? (Deleted/Filtered)
                    // Keep cursor clamped to bounds
                    this.cursorIndex = Math.min(this.cursorIndex, maxIndex);
                    // Update ID to whatever is now under the cursor
                    this.lastSelectedId = this.buffer.messages[this.cursorIndex]?.id || null;
                }
            }
        }
    }
}
