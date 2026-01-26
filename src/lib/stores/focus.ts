// src/lib/stores/focus.ts
// Focus state management for the application

import { writable, derived, get } from 'svelte/store';

interface FocusState {
    isInsertMode: boolean;
    isWindowFocused: boolean;
}

function createFocusStore() {
    const store = writable<FocusState>({
        isInsertMode: false,
        isWindowFocused: true
    });

    return {
        // Make it subscribable
        subscribe: store.subscribe,

        // Derived stores for individual values
        isInsertMode: derived(store, $s => $s.isInsertMode),
        isWindowFocused: derived(store, $s => $s.isWindowFocused),

        // Actions
        enterInsertMode: () => store.update(s => ({ ...s, isInsertMode: true })),
        exitInsertMode: () => store.update(s => ({ ...s, isInsertMode: false })),

        onWindowFocus: () => store.update(s => ({ ...s, isWindowFocused: true })),
        onWindowBlur: () => store.update(s => ({ ...s, isWindowFocused: false })),

        // Get current values (for non-reactive access)
        get insertMode() {
            return get(store).isInsertMode;
        },
        get windowFocused() {
            return get(store).isWindowFocused;
        }
    };
}

export const focusStore = createFocusStore();
