import { derived } from 'svelte/store';
import { chatStore } from './chat';

export const hudStore = derived(chatStore, ($chat) => {
    // 1. Ego Heat (Pink) -> Triage Buffer Size
    // 2. Signal Heat (Teal) -> Inbox Buffer Size
    
    return {
        ego: $chat.virtualCounts.triage,
        signal: $chat.virtualCounts.inbox
    };
});
