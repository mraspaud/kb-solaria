import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import App from './App.svelte';

// We mock the 'socketStore' because we don't want a real network connection in unit tests.
// We just want to know if the UI calls the right functions.
vi.mock('./lib/socketStore', () => ({
    messages: { subscribe: (run: any) => { run([]); return () => {}; } }, // Mock empty messages
    status: { subscribe: (run: any) => { run('connected'); return () => {}; } }, // Mock connected status
    connect: vi.fn(),     // Mock function
    sendMessage: vi.fn()  // Mock function we can spy on
}));

// Import the mocked module to inspect if it was called
import * as socketStore from './lib/socketStore';

describe('App Component', () => {
    it('renders the title and input', () => {
        render(App);
        
        // Check if the title exists
        expect(screen.getByText('KB-Unified')).toBeInTheDocument();
        
        // Check if the input exists
        const input = screen.getByRole('textbox');
        expect(input).toBeInTheDocument();
    });

    it('clears input after pressing Enter', async () => {
        render(App);
        const input = screen.getByRole('textbox') as HTMLInputElement;

        // 1. Simulate user typing "hello"
        await fireEvent.input(input, { target: { value: 'hello' } });
        expect(input.value).toBe('hello');

        // 2. Simulate pressing Enter
        await fireEvent.keyDown(input, { key: 'Enter' });

        // 3. Assertions:
        // Did we call the sendMessage function?
        expect(socketStore.sendMessage).toHaveBeenCalledWith('hello');
        // Did the input clear?
        expect(input.value).toBe('');
    });
});
