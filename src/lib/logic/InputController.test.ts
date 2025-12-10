import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InputController } from './InputController';
import { DEFAULT_KEYMAP, type Command } from './keymap';

describe('InputController', () => {
    let controller: InputController;
    let commandLog: Command[] = [];

    const handleCommand = (cmd: Command) => {
        commandLog.push(cmd);
    };

    beforeEach(() => {
        commandLog = [];
        controller = new InputController(DEFAULT_KEYMAP, handleCommand);
        vi.useFakeTimers();
    });

    const press = (key: string, ctrl = false, shift = false) => {
        const event = new KeyboardEvent('keydown', { 
            key, 
            ctrlKey: ctrl, 
            shiftKey: shift,
            cancelable: true // Important for preventing default browser actions
        });
        
        // Mock preventDefault to check if controller claims the key
        const spy = vi.spyOn(event, 'preventDefault');
        controller.handleKey(event);
        return spy;
    };

    it('handles context-aware Enter key', () => {
        press('Enter');
        expect(commandLog).toContain('ACTIVATE_SELECTION');
    });

    it('handles the "gf" (Go File) sequence from Inspector', () => {
        press('g');
        expect(commandLog).toHaveLength(0); // Should wait

        vi.advanceTimersByTime(100);
        
        press('f');
        expect(commandLog).toContain('OPEN_FILE');
    });

    it('handles Escape to Cancel', () => {
        const spy = press('Escape');
        expect(commandLog).toContain('CANCEL');
        // Ensure we prevent default behavior (like browser stop loading)
        expect(spy).toHaveBeenCalled();
    });

    it('handles Tab for Peeking', () => {
        const spy = press('Tab');
        expect(commandLog).toContain('PEEK_CONTEXT');
        expect(spy).toHaveBeenCalled(); // Should prevent focus change
    });

    it('resolves conflicting prefixes (g x vs g f)', () => {
        // Press 'g'
        press('g');
        expect(commandLog).toHaveLength(0);

        // Press 'x' -> OPEN_LINK
        vi.advanceTimersByTime(100);
        press('x');
        expect(commandLog).toContain('OPEN_LINK');
        expect(commandLog).not.toContain('OPEN_FILE');

        // Reset
        commandLog = [];
        
        // Press 'g' ... wait ... 'f' -> OPEN_FILE
        press('g');
        vi.advanceTimersByTime(100);
        press('f');
        expect(commandLog).toContain('OPEN_FILE');
    });
});
