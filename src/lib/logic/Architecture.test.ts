import { describe, it, expect, beforeEach } from 'vitest';
import { ChatBuffer } from './ChatBuffer';
import { ChatWindow } from './ChatWindow';

const createMsg = (id: string) => ({ 
    id, author: 'Me', content: 'txt', timestamp: new Date() 
});

describe('Chat Interaction Logic', () => {
    let buffer: ChatBuffer;
    let window: ChatWindow;

    beforeEach(() => {
        // We inject the buffer into the window, implying a strict relationship
        buffer = new ChatBuffer();
        window = new ChatWindow(buffer);
    });

    it('starts empty and attached', () => {
        expect(window.cursorIndex).toBe(-1);
        expect(window.isAttached).toBe(true);
    });

    it('auto-advances cursor when attached (Chat Mode)', () => {
        // 1. First message
        buffer.addMessage(createMsg('1'));
        expect(window.cursorIndex).toBe(0);

        // 2. Second message
        buffer.addMessage(createMsg('2'));
        expect(window.cursorIndex).toBe(1);
    });

    it('detaches when moving up (Review Mode)', () => {
        buffer.addMessage(createMsg('1'));
        buffer.addMessage(createMsg('2'));
        
        // User moves UP
        window.moveCursor(-1);
        
        expect(window.cursorIndex).toBe(0); // Moved back
        expect(window.isAttached).toBe(false); // Detached
    });

    it('stays put when new messages arrive if detached', () => {
        buffer.addMessage(createMsg('1'));
        buffer.addMessage(createMsg('2'));
        window.moveCursor(-1); // At index 0

        // New message arrives
        buffer.addMessage(createMsg('3'));

        // Should NOT auto-scroll
        expect(window.cursorIndex).toBe(0);
        // But logic should know we are behind
        expect(buffer.messages.length).toBe(3);
    });

    it('re-attaches when jumping to bottom', () => {
        buffer.addMessage(createMsg('1'));
        window.moveCursor(-1);
        
        window.jumpToBottom();

        expect(window.isAttached).toBe(true);
        expect(window.cursorIndex).toBe(0);
    });

    it('re-attaches if user manually scrolls to the new bottom', () => {
        buffer.addMessage(createMsg('1'));
        buffer.addMessage(createMsg('2')); 
        
        window.moveCursor(-1); // At 0 (Detached)
        
        // User moves DOWN to 1 (Bottom)
        window.moveCursor(1);

        expect(window.cursorIndex).toBe(1);
        expect(window.isAttached).toBe(true);
    });
});
