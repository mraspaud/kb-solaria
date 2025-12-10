import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import InputGhost from './InputGhost.svelte';

// Mock the stores
vi.mock('../stores/input', () => ({
    inputEngine: { 
        subscribe: (run: any) => { 
            // Default state: NO match
            run({ raw: 'hello', cursorPos: 5, match: null, selectedIndex: 0 }); 
            return () => {}; 
        },
        update: vi.fn(),
        reset: vi.fn(),
        resolve: vi.fn()
    },
    ghostText: { subscribe: (run: any) => { run(''); return () => {}; } },
    entityRegex: { subscribe: (run: any) => { run(null); return () => {}; } },
    users: { subscribe: (run: any) => { run([]); return () => {}; } } // Needed for validation logic
}));

// Mock socket store (used for typing indicators)
vi.mock('../socketStore', () => ({
    sendTyping: vi.fn()
}));

// Mock chat store (used for channel context)
vi.mock('../stores/chat', () => ({
    chatStore: { 
        subscribe: (run: any) => { 
            run({ activeChannel: { id: 'gen', service: { id: 'int' } }, availableChannels: [] }); 
            return () => {}; 
        } 
    }
}));

describe('InputGhost Component', () => {
    it('traps Tab key even when no autocomplete is active', async () => {
        const { getByRole } = render(InputGhost);
        const textarea = getByRole('textbox');

        // Simulate Tab Press
        // We create a custom event to spy on preventDefault
        const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
        const spy = vi.spyOn(event, 'preventDefault');
        
        textarea.dispatchEvent(event);

        // The bug was that this was NOT called, letting focus escape
        expect(spy).toHaveBeenCalled();
    });
});
