// src/lib/logic/reactionAnalyzer.ts
// Reaction state analysis and sorting for the ReactionPicker

import { normalizeEmojiKey, type Emoji } from '../stores/emoji';
import fuzzysort from 'fuzzysort';

export type ReactionStatus = 'mine' | 'others' | 'none';

/**
 * Build a map of emoji -> reaction status for a message
 * Keys are normalized to canonical emoji IDs
 */
export function buildReactionState(
    reactions: Record<string, string[]> | undefined,
    currentUserId: string
): Map<string, ReactionStatus> {
    const state = new Map<string, ReactionStatus>();

    if (!reactions) return state;

    Object.entries(reactions).forEach(([key, users]) => {
        const normalizedKey = normalizeEmojiKey(key);
        if (users.includes(currentUserId)) {
            state.set(normalizedKey, 'mine');
        } else if (users.length > 0) {
            state.set(normalizedKey, 'others');
        }
    });

    return state;
}

/**
 * Get reaction status for a specific emoji
 */
export function getEmojiStatus(
    emoji: Emoji,
    reactionState: Map<string, ReactionStatus>
): ReactionStatus {
    return reactionState.get(emoji.id) || 'none';
}

/**
 * Generate sorted/filtered display list for the picker
 * - With query: fuzzy search
 * - Without query: tiered sort (mine -> others -> rest)
 */
export function getDisplayList(
    query: string,
    allEmojis: Emoji[],
    reactionState: Map<string, ReactionStatus>,
    limit = 100
): Emoji[] {
    if (query) {
        // Search mode: fuzzy match on id and keywords
        return fuzzysort.go(query, allEmojis, {
            keys: ['id', 'keywords'],
            limit: 50,
            threshold: -10000
        }).map(res => res.obj);
    }

    // Default view: tiered sort
    const sorted = [...allEmojis].sort((a, b) => {
        const statA = getEmojiStatus(a, reactionState);
        const statB = getEmojiStatus(b, reactionState);

        const score = (s: ReactionStatus) => {
            if (s === 'mine') return 0;   // Priority 1
            if (s === 'others') return 1; // Priority 2
            return 2;                     // Priority 3 (Rest)
        };

        const scoreA = score(statA);
        const scoreB = score(statB);

        if (scoreA !== scoreB) return scoreA - scoreB;

        // Tie-breaker: native order (Custom -> Popular -> Standard)
        return a.sortOrder - b.sortOrder;
    });

    return sorted.slice(0, limit);
}

/**
 * Determine action (add/remove) based on current state
 */
export function getReactionAction(
    emojiKey: string,
    reactionState: Map<string, ReactionStatus>
): 'add' | 'remove' {
    return reactionState.get(emojiKey) === 'mine' ? 'remove' : 'add';
}
