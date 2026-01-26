// src/lib/stores/readStatus.ts
// Read status tracking with debounced mark-as-read

import { writable, get } from 'svelte/store';

interface ReadStatusState {
    lastAckedMsgId: string | null;
    lastChannelId: string;
}

function createReadStatusStore() {
    const state = writable<ReadStatusState>({
        lastAckedMsgId: null,
        lastChannelId: ''
    });

    let markReadTimer: ReturnType<typeof setTimeout> | undefined;

    return {
        subscribe: state.subscribe,

        /**
         * Get the last acknowledged message ID
         */
        get lastAckedMsgId() {
            return get(state).lastAckedMsgId;
        },

        /**
         * Get the last channel ID (for detecting channel switches)
         */
        get lastChannelId() {
            return get(state).lastChannelId;
        },

        /**
         * Record that a message was acknowledged as read
         */
        setLastAcked: (msgId: string) => {
            state.update(s => ({ ...s, lastAckedMsgId: msgId }));
        },

        /**
         * Reset last acked (e.g., when jumping to bottom)
         */
        clearLastAcked: () => {
            state.update(s => ({ ...s, lastAckedMsgId: null }));
        },

        /**
         * Handle channel switch - reset acked state and record new channel
         */
        onChannelSwitch: (channelId: string) => {
            clearTimeout(markReadTimer);
            state.update(s => ({
                ...s,
                lastAckedMsgId: null,
                lastChannelId: channelId
            }));
        },

        /**
         * Check if channel changed
         */
        didChannelChange: (channelId: string): boolean => {
            return get(state).lastChannelId !== channelId;
        },

        /**
         * Schedule a mark-read action with debounce
         * @param action - The function to call
         * @param immediate - If true, execute immediately instead of debouncing
         * @param delay - Debounce delay in ms (default 1000)
         */
        scheduleMarkRead: (
            action: () => void,
            immediate = false,
            delay = 1000
        ) => {
            clearTimeout(markReadTimer);
            if (immediate) {
                action();
            } else {
                markReadTimer = setTimeout(action, delay);
            }
        },

        /**
         * Cancel any pending mark-read action
         */
        cancelPendingMarkRead: () => {
            clearTimeout(markReadTimer);
        },

        /**
         * Reset all state (for cleanup)
         */
        reset: () => {
            clearTimeout(markReadTimer);
            state.set({
                lastAckedMsgId: null,
                lastChannelId: ''
            });
        }
    };
}

export const readStatusStore = createReadStatusStore();
