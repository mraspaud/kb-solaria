// src/lib/stores/reactionHandler.ts
// Reaction add/remove logic with emoji normalization

import type { Message, ChatState } from '../logic/types';
import { normalizeEmojiKey } from './emoji';

export interface ReactionUpdate {
    updatedMessages: Map<string, Message>;
}

/**
 * Apply a reaction add or remove to a message.
 * Returns updated messages map for store update, or null if no change needed.
 */
export function applyReaction(
    state: ChatState,
    msgId: string,
    emoji: string,
    userId: string,
    action: 'add' | 'remove'
): ReactionUpdate | null {
    const msg = state.entities.messages.get(msgId);
    if (!msg) return null;

    // Normalize emoji key to handle different formats:
    // - Unicode chars: "👍"
    // - Slack shortcodes: "+1", "thumbsup"
    // - Standard shortcodes: "thumbs_up"
    const normalizedEmoji = normalizeEmojiKey(emoji);

    // Find existing reaction that normalizes to the same key
    const currentReactions = msg.reactions || {};
    const existingKey = Object.keys(currentReactions).find(
        k => normalizeEmojiKey(k) === normalizedEmoji
    );
    const reactionKey = existingKey || emoji;

    let users = [...(currentReactions[reactionKey] || [])];

    if (action === 'add') {
        if (!users.includes(userId)) users.push(userId);
    } else {
        users = users.filter(u => u !== userId);
    }

    // Build new reactions object
    const newReactions = { ...currentReactions };
    if (users.length > 0) {
        newReactions[reactionKey] = users;
    } else {
        delete newReactions[reactionKey];
    }

    // Create new message object for reactivity
    const updatedMsg = { ...msg, reactions: newReactions };

    // Create new Map for reactivity
    const newMessages = new Map(state.entities.messages);
    newMessages.set(msgId, updatedMsg);

    return { updatedMessages: newMessages };
}
