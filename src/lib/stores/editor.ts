// src/lib/stores/editor.ts
// Message editing state management

import { writable, get } from 'svelte/store';

function createEditorStore() {
    const editingMessageId = writable<string | null>(null);

    return {
        // Expose store for subscription
        subscribe: editingMessageId.subscribe,

        // Check if currently editing
        get isEditing() {
            return get(editingMessageId) !== null;
        },

        // Get the ID being edited
        get messageId() {
            return get(editingMessageId);
        },

        // Start editing a message
        startEdit: (msgId: string) => {
            editingMessageId.set(msgId);
        },

        // Cancel editing
        cancelEdit: () => {
            editingMessageId.set(null);
        },

        // Complete editing (after send)
        completeEdit: () => {
            editingMessageId.set(null);
        }
    };
}

export const editorStore = createEditorStore();
