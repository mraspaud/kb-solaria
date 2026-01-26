import { writable, derived } from 'svelte/store';
import compactData from 'emojibase-data/en/compact.json';
import shortcodes from 'emojibase-data/en/shortcodes/github.json';

export interface Emoji {
    id: string;
    char?: string;
    url?: string;
    keywords: string[];
    isCustom: boolean;
    shortcode: string;
    sortOrder: number; // 0 = Custom, 1 = Popular, 2 = Standard
}

// "Top Hits" to boost to the top of the list
const POPULAR_EMOJIS = [
    "thumbs_up", "thumbs_down",
    "fire", "face_with_tears_of_joy", "crying_face", "red_heart", "eyes", "rocket",
    "party_popper", "check_mark", "x", "thinking_face", "grinning_face_with_sweat",
    "100", "skull", "clown_face", "warning"
];

// Helper to check if an ID is popular
const isPopular = (id: string) => POPULAR_EMOJIS.includes(id);

// 1. PROCESS STANDARD DATA
const STANDARD_LIST: Emoji[] = compactData.map((item: any) => {
    const hex = item.hex || item.u; 
    const rawShortcode = shortcodes[hex];
    const primaryShortcode = Array.isArray(rawShortcode) ? rawShortcode[0] : rawShortcode;
    const safeId = primaryShortcode || item.label.toLowerCase().replace(/[^a-z0-9-_]/g, '_');

    return {
        id: safeId,
        char: item.unicode, 
        keywords: [safeId, ...(item.tags || [])],
        isCustom: false,
        shortcode: `:${safeId}:`,
        // Rank: 1 if popular, 2 if standard
        sortOrder: isPopular(safeId) ? 1 : 2
    };
});

// 2. CUSTOM EMOJI STORE
const customStore = writable<Emoji[]>([]);

export const emojiStore = {
    setCustom: (data: Record<string, { path: string, aliases?: string[] }>) => {
        const list: Emoji[] = Object.entries(data).map(([key, val]) => ({
            id: key,
            url: val.path,
            keywords: [key, ...(val.aliases || [])],
            isCustom: true,
            shortcode: `:${key}:`,
            sortOrder: 0 // Rank 0: Custom always on top
        }));
        customStore.set(list);
    }
};

// 3. COMBINED & SORTED STORE
export const allEmojis = derived(customStore, ($custom) => {
    const combined = [...$custom, ...STANDARD_LIST];

    // Sort by: sortOrder ASC, then Original Index (Stability)
    // Since native sort is stable in modern JS, we just sort by order.
    return combined.sort((a, b) => a.sortOrder - b.sortOrder);
});

// 4. EMOJI LOOKUP HELPERS
// Build lookup maps for finding emojis by various key formats
// This is needed because Slack/Mattermost send reactions in different formats

// Map from various key formats to the canonical emoji id
const keyToIdMap = new Map<string, string>();

// Helper to strip variation selectors (U+FE0F) for matching
const stripVariationSelectors = (s: string) => s.replace(/\ufe0f/g, '');

// Build the lookup map from standard emojis
STANDARD_LIST.forEach(emoji => {
    const id = emoji.id;
    // Map the id itself
    keyToIdMap.set(id, id);
    // Map the unicode char (with and without variation selectors)
    if (emoji.char) {
        keyToIdMap.set(emoji.char, id);
        keyToIdMap.set(emoji.char.normalize('NFC'), id);
        // Backend sends emojis without variation selectors, so also map the stripped version
        const stripped = stripVariationSelectors(emoji.char);
        if (stripped !== emoji.char) {
            keyToIdMap.set(stripped, id);
        }
    }
    // Map common shortcode variations (with/without colons, underscores vs hyphens)
    keyToIdMap.set(`:${id}:`, id);
    keyToIdMap.set(id.replace(/_/g, '-'), id);  // thumbs_up -> thumbs-up
    keyToIdMap.set(id.replace(/-/g, '_'), id);  // thumbs-up -> thumbs_up
});

// Add common Slack shortcode aliases
const SLACK_ALIASES: Record<string, string> = {
    '+1': 'thumbs_up',
    '-1': 'thumbs_down',
    'thumbsup': 'thumbs_up',
    'thumbsdown': 'thumbs_down',
    ':+1:': 'thumbs_up',
    ':-1:': 'thumbs_down',
    ':thumbsup:': 'thumbs_up',
    ':thumbsdown:': 'thumbs_down',
    'slightly_smiling_face': 'slightly_smiling_face',
    'smile': 'grinning_face_with_smiling_eyes',
    'grin': 'beaming_face_with_smiling_eyes',
    'joy': 'face_with_tears_of_joy',
    'heart': 'red_heart',
    'tada': 'party_popper',
    'eyes': 'eyes',
    'fire': 'fire',
    'rocket': 'rocket',
    'thinking': 'thinking_face',
    'thinking_face': 'thinking_face',
    'white_check_mark': 'check_mark_button',
    'heavy_check_mark': 'check_mark',
    'x': 'cross_mark',
    'skull': 'skull',
    '100': 'hundred_points',
    'clown': 'clown_face',
    'clown_face': 'clown_face',
    'warning': 'warning',
    'wave': 'waving_hand',
    'pray': 'folded_hands',
    'ok_hand': 'ok_hand',
    'raised_hands': 'raising_hands',
};

Object.entries(SLACK_ALIASES).forEach(([alias, id]) => {
    keyToIdMap.set(alias, id);
    keyToIdMap.set(`:${alias}:`, id);
});

/**
 * Find the canonical emoji ID for a reaction key.
 * Handles unicode chars, shortcodes, and Slack-style names.
 */
export function normalizeEmojiKey(key: string): string {
    if (!key) return key;

    // Try direct lookup
    const normalized = key.normalize('NFC');
    if (keyToIdMap.has(normalized)) {
        return keyToIdMap.get(normalized)!;
    }

    // Try without variation selectors (backend sends emojis without U+FE0F)
    const noVariation = stripVariationSelectors(normalized);
    if (noVariation !== normalized && keyToIdMap.has(noVariation)) {
        return keyToIdMap.get(noVariation)!;
    }

    // Try lowercase
    const lower = normalized.toLowerCase();
    if (keyToIdMap.has(lower)) {
        return keyToIdMap.get(lower)!;
    }

    // Try stripping colons
    const stripped = lower.replace(/^:|:$/g, '');
    if (keyToIdMap.has(stripped)) {
        return keyToIdMap.get(stripped)!;
    }

    // Return original if no match found
    return key;
}

/**
 * Find an emoji object by any key format.
 */
export function findEmoji(key: string, emojiList: Emoji[]): Emoji | undefined {
    const normalizedId = normalizeEmojiKey(key);
    return emojiList.find(e => e.id === normalizedId || e.char === key);
}
