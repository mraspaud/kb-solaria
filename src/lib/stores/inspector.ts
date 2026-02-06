import { writable, derived } from 'svelte/store';
import { chatStore } from './chat';
import type { Message } from '../logic/types';

export type InspectorMode = 'IDLE' | 'CONTEXT' | 'MEDIA' | 'STAGING' | 'LABORATORY' | 'DIRECTORY';

function createInspectorStore() {
    // Manual overrides (Laboratory/Staging)
    const overrideMode = writable<InspectorMode | null>(null);

    // Reactively determine mode based on the cursor
    const mode = derived(
        [chatStore, overrideMode],
        ([$chat, $override]) => {
            if ($override) return $override;

            const msg = $chat.messages[$chat.cursorIndex];
            if (!msg) return 'IDLE';

            // Priority 1: Media
            if (msg.attachments && msg.attachments.length > 0) {
                return 'MEDIA';
            }

            // Priority 2: Context (Thread/Reply)
            if (!$chat.activeChannel.isThread) { 
                if ((msg.replyCount && msg.replyCount > 0)) {
                    return 'CONTEXT';
                }
            }

            return 'IDLE';
        }
    );

    return {
        subscribe: mode.subscribe,
        setOverride: (m: InspectorMode | null) => overrideMode.set(m),
        toggleLab: () => overrideMode.update(c => c === 'LABORATORY' ? null : 'LABORATORY')
    };
}

export const inspectorStore = createInspectorStore();
