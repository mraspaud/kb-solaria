import { describe, it, expect, beforeEach } from 'vitest';
import { ChatBuffer } from './ChatBuffer';
import { ChatWindow } from './ChatWindow';
import type { Message } from './types';

const createMsg = (id: string): Message => ({ 
    id, 
    author: { id: 'me', name: 'Me', color: '#fff' }, 
    content: 'txt', 
    timestamp: new Date(),
    reactions: {} 
});

describe('Chat Interaction Logic', () => {
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
        buffer.addMessage(createMsg('1'));
        expect(window.cursorIndex).toBe(0);

        buffer.addMessage(createMsg('2'));
        expect(window.cursorIndex).toBe(1);
    });

    it('detaches when moving up (Review Mode)', () => {
        buffer.addMessage(createMsg('1'));
        buffer.addMessage(createMsg('2'));
        
        window.moveCursor(-1);
        
        expect(window.cursorIndex).toBe(0); 
        expect(window.isAttached).toBe(false); 
    });

    it('stays put when new messages arrive if detached', () => {
        buffer.addMessage(createMsg('1'));
        buffer.addMessage(createMsg('2'));
        window.moveCursor(-1); // At index 0

        buffer.addMessage(createMsg('3'));

        expect(window.cursorIndex).toBe(0);
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
        
        window.moveCursor(-1); 
        
        window.moveCursor(1);

        expect(window.cursorIndex).toBe(1);
        expect(window.isAttached).toBe(true);
    });
});
