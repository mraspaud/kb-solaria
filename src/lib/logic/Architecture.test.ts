// src/lib/logic/Architecture.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ChatBuffer } from './ChatBuffer';
import { ChatWindow } from './ChatWindow';

describe('Chat Logic (Normalized)', () => {
    let buffer: ChatBuffer;
    let window: ChatWindow;

    beforeEach(() => {
        buffer = new ChatBuffer();
        window = new ChatWindow(buffer);
    });

    it('starts empty and attached', () => {
        expect(window.cursorIndex).toBe(-1);
        expect(window.isAttached).toBe(true);
    });

    it('auto-advances cursor when attached (Chat Mode)', () => {
        // We push IDs directly now
        buffer.addMessageId('m1');
        expect(window.cursorIndex).toBe(0);

        buffer.addMessageId('m2');
        expect(window.cursorIndex).toBe(1);
    });

    it('detaches when moving up (Review Mode)', () => {
        buffer.addMessageId('m1');
        buffer.addMessageId('m2');
        
        window.moveCursor(-1);
        
        expect(window.cursorIndex).toBe(0); 
        expect(window.isAttached).toBe(false); 
    });

    it('stays put when new messages arrive if detached', () => {
        buffer.addMessageId('m1');
        buffer.addMessageId('m2');
        
        window.moveCursor(-1); // At index 0 (m1)

        buffer.addMessageId('m3');

        expect(window.cursorIndex).toBe(0); // Should still point to m1
        expect(buffer.messageIds.length).toBe(3);
    });

    it('re-attaches when jumping to bottom', () => {
        buffer.addMessageId('m1');
        window.moveCursor(-1);
        
        window.jumpToBottom();

        expect(window.isAttached).toBe(true);
        expect(window.cursorIndex).toBe(0);
    });
    
    it('handles sticky selection if messages shift (prepend)', () => {
        // Simulate history load: [m2] -> [m1, m2]
        buffer.addMessageId('m2');
        window.jumpToBottom(); // Cursor at 0 (m2)
        
        window.detach(); // Detach to stick to m2
        
        buffer.prependMessageId('m1'); // Insert older message
        
        // Cursor should have shifted to 1 to follow "m2"
        expect(window.cursorIndex).toBe(1);
        expect(buffer.messageIds[window.cursorIndex]).toBe('m2');
    });
});
