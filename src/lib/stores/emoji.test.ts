// src/lib/stores/emoji.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeEmojiKey, findEmoji, allEmojis } from './emoji';
import { get } from 'svelte/store';

describe('Emoji Normalization', () => {
    describe('normalizeEmojiKey', () => {
        it('returns empty string for empty input', () => {
            expect(normalizeEmojiKey('')).toBe('');
        });

        it('normalizes Slack +1 to thumbs_up', () => {
            expect(normalizeEmojiKey('+1')).toBe('thumbs_up');
            expect(normalizeEmojiKey(':+1:')).toBe('thumbs_up');
        });

        it('normalizes Slack -1 to thumbs_down', () => {
            expect(normalizeEmojiKey('-1')).toBe('thumbs_down');
            expect(normalizeEmojiKey(':-1:')).toBe('thumbs_down');
        });

        it('normalizes thumbsup variations to thumbs_up', () => {
            expect(normalizeEmojiKey('thumbsup')).toBe('thumbs_up');
            expect(normalizeEmojiKey(':thumbsup:')).toBe('thumbs_up');
        });

        it('normalizes thumbsdown variations to thumbs_down', () => {
            expect(normalizeEmojiKey('thumbsdown')).toBe('thumbs_down');
            expect(normalizeEmojiKey(':thumbsdown:')).toBe('thumbs_down');
        });

        it('normalizes common Slack aliases', () => {
            expect(normalizeEmojiKey('joy')).toBe('face_with_tears_of_joy');
            expect(normalizeEmojiKey('heart')).toBe('red_heart');
            expect(normalizeEmojiKey('tada')).toBe('party_popper');
            expect(normalizeEmojiKey('thinking')).toBe('thinking_face');
            expect(normalizeEmojiKey('fire')).toBe('fire');
            expect(normalizeEmojiKey('rocket')).toBe('rocket');
            expect(normalizeEmojiKey('eyes')).toBe('eyes');
        });

        it('normalizes with colons', () => {
            expect(normalizeEmojiKey(':joy:')).toBe('face_with_tears_of_joy');
            expect(normalizeEmojiKey(':heart:')).toBe('red_heart');
            expect(normalizeEmojiKey(':tada:')).toBe('party_popper');
        });

        it('normalizes case-insensitively', () => {
            expect(normalizeEmojiKey('THUMBSUP')).toBe('thumbs_up');
            expect(normalizeEmojiKey('ThumbsUp')).toBe('thumbs_up');
            expect(normalizeEmojiKey(':THUMBSUP:')).toBe('thumbs_up');
        });

        it('normalizes underscore/hyphen variations', () => {
            expect(normalizeEmojiKey('thumbs-up')).toBe('thumbs_up');
            expect(normalizeEmojiKey('thumbs_up')).toBe('thumbs_up');
        });

        it('returns original key when no match found', () => {
            expect(normalizeEmojiKey('unknown_emoji_xyz')).toBe('unknown_emoji_xyz');
            expect(normalizeEmojiKey(':custom_emoji:')).toBe(':custom_emoji:');
        });

        it('normalizes check mark variations', () => {
            expect(normalizeEmojiKey('white_check_mark')).toBe('check_mark_button');
            expect(normalizeEmojiKey('heavy_check_mark')).toBe('check_mark');
        });

        it('normalizes unicode emojis when they match the emojibase data', () => {
            // Note: Some unicode emojis (like thumbs up/down) may have skin tone
            // variations in emojibase and won't match the basic unicode character.
            // This test verifies that unicode normalization works for emojis that
            // do have exact matches in the data.
            expect(normalizeEmojiKey('🔥')).toBe('fire');
            expect(normalizeEmojiKey('🚀')).toBe('rocket');
            expect(normalizeEmojiKey('👀')).toBe('eyes');
        });

        it('normalizes unicode emojis without variation selectors (backend format)', () => {
            // Backend sends emojis WITHOUT variation selectors (U+FE0F)
            // e.g., 👍 (U+1F44D) not 👍️ (U+1F44D + U+FE0F)
            // This test ensures we can match backend-sent emojis to emojibase IDs
            const thumbsUpNoSelector = '\u{1F44D}';  // 👍 without FE0F
            expect(normalizeEmojiKey(thumbsUpNoSelector)).toBe('thumbs_up');

            const thumbsDownNoSelector = '\u{1F44E}';  // 👎 without FE0F
            expect(normalizeEmojiKey(thumbsDownNoSelector)).toBe('thumbs_down');
        });
    });

    describe('findEmoji', () => {
        it('finds emoji by canonical id', () => {
            const emojis = get(allEmojis);
            const emoji = findEmoji('thumbs_up', emojis);
            expect(emoji).toBeDefined();
            expect(emoji?.id).toBe('thumbs_up');
        });

        it('finds emoji by Slack shortcode', () => {
            const emojis = get(allEmojis);
            const emoji = findEmoji('+1', emojis);
            expect(emoji).toBeDefined();
            expect(emoji?.id).toBe('thumbs_up');
        });

        it('finds emoji by unicode char for emojis with exact match', () => {
            const emojis = get(allEmojis);
            // Use an emoji that has exact unicode match in emojibase
            const emoji = findEmoji('🔥', emojis);
            expect(emoji).toBeDefined();
            expect(emoji?.id).toBe('fire');
        });

        it('returns undefined for unknown emoji', () => {
            const emojis = get(allEmojis);
            const emoji = findEmoji('nonexistent_emoji_xyz', emojis);
            expect(emoji).toBeUndefined();
        });
    });

    describe('Emoji deduplication in reactions', () => {
        // These tests simulate the reaction handling scenario
        it('treats +1 and thumbs_up as the same reaction', () => {
            const key1 = normalizeEmojiKey('+1');
            const key2 = normalizeEmojiKey('thumbs_up');
            expect(key1).toBe(key2);
        });

        it('treats different shortcode variations as the same reaction', () => {
            // Different ways to represent the same emoji should normalize to the same key
            const key1 = normalizeEmojiKey('thumbsup');
            const key2 = normalizeEmojiKey('thumbs_up');
            const key3 = normalizeEmojiKey(':thumbsup:');
            expect(key1).toBe(key2);
            expect(key2).toBe(key3);
        });

        it('allows matching existing reactions regardless of format', () => {
            // Simulate: Server sends reaction as "+1", user clicks on thumbs_up in picker
            const serverKey = '+1';
            const userKey = 'thumbs_up';

            // After normalization, they should match
            expect(normalizeEmojiKey(serverKey)).toBe(normalizeEmojiKey(userKey));
        });

        it('handles reaction state lookup correctly', () => {
            // Simulate building reactionState map
            const reactions: Record<string, string[]> = {
                '+1': ['user1', 'user2'],  // Slack sends +1
                'fire': ['user3']
            };

            const reactionState = new Map<string, 'mine' | 'others' | 'none'>();
            const myId = 'user1';

            Object.entries(reactions).forEach(([key, users]) => {
                const normalizedKey = normalizeEmojiKey(key);
                if (users.includes(myId)) {
                    reactionState.set(normalizedKey, 'mine');
                } else {
                    reactionState.set(normalizedKey, 'others');
                }
            });

            // Now when we look up thumbs_up (what the picker uses), it should find 'mine'
            expect(reactionState.get('thumbs_up')).toBe('mine');
            expect(reactionState.get('fire')).toBe('others');
        });

        it('handles backend unicode reactions (without variation selectors)', () => {
            // Backend sends reactions as Unicode WITHOUT variation selectors
            // Frontend needs to match these to emojibase IDs
            const reactions: Record<string, string[]> = {
                '\u{1F44D}': ['user1'],  // Backend sends 👍 (no FE0F)
                '\u{1F525}': ['user2']   // Backend sends 🔥 (no FE0F)
            };

            const reactionState = new Map<string, 'mine' | 'others' | 'none'>();
            const myId = 'user1';

            Object.entries(reactions).forEach(([key, users]) => {
                const normalizedKey = normalizeEmojiKey(key);
                if (users.includes(myId)) {
                    reactionState.set(normalizedKey, 'mine');
                } else {
                    reactionState.set(normalizedKey, 'others');
                }
            });

            // Picker uses emojibase IDs, should match
            expect(reactionState.get('thumbs_up')).toBe('mine');
            expect(reactionState.get('fire')).toBe('others');
        });
    });
});
