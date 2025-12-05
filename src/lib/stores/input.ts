import { writable, derived, get } from 'svelte/store';
import { chatStore } from './chat';
import { inspectorStore } from './inspector';
import fuzzysort from 'fuzzysort';

// --- TYPES ---
export type TriggerType = '@' | '#' | ':' | null;

interface MatchResult {
    trigger: TriggerType;
    query: string;
    index: number; // Where the trigger started
}

interface InputState {
    raw: string;
    cursorPos: number;
    match: MatchResult | null;
    selectedIndex: number;
}

// --- DATA SOURCES ---
// 1. Common Emojis (Static for now, can be dynamic later)
const EMOJIS = ["thumbsup", "thumbsdown", "fire", "rocket", "eyes", "check_mark", "x", "tada", "joy", "heart", "sob", "thinking"];

// 2. Users (Derived from Message History for now)
export const users = derived(chatStore, $s => {
    const unique = new Map();
    if($s.currentUser) unique.set($s.currentUser.id, $s.currentUser);
    $s.messages.forEach(m => unique.set(m.author.id, m.author));
    return Array.from(unique.values());
});

// --- STATE ---
const initialState: InputState = { raw: "", cursorPos: 0, match: null, selectedIndex: 0 };
const store = writable<InputState>(initialState);

// --- LOGIC: THE ENGINE ---
export const inputEngine = {
    subscribe: store.subscribe,

    update: (raw: string, cursorPos: number) => {
        const match = detectTrigger(raw, cursorPos);
        
        store.update(s => {
            // If match changed, reset index
            const isNewMatch = JSON.stringify(match) !== JSON.stringify(s.match);
            return {
                raw, 
                cursorPos, 
                match, 
                selectedIndex: isNewMatch ? 0 : s.selectedIndex
            };
        });

        // Drive the Inspector
        if (match) {
            inspectorStore.setOverride('DIRECTORY');
        } else {
            // Only release if we were in DIRECTORY mode
            if (get(inspectorStore) === 'DIRECTORY') {
                inspectorStore.setOverride(null);
            }
        }
    },

    moveSelection: (delta: number) => {
        store.update(s => {
            const list = get(candidates);
            if (list.length === 0) return s;
            const len = list.length;
            const newIdx = (s.selectedIndex + delta + len) % len;
            return { ...s, selectedIndex: newIdx };
        });
    },
    
    // Commit the "Ghost" text into the raw string
    resolve: () => {
        const s = get(store);
        const list = get(candidates);
        if (!s.match || list.length === 0) return false;

        const target = list[s.selectedIndex];
        // Determine replacement text
        let replacement = "";
        if (s.match.trigger === '#') replacement = target.obj.name; // Channels: "general"
        if (s.match.trigger === '@') replacement = target.obj.name; // Users: "Martin"
        if (s.match.trigger === ':') replacement = target.obj + ":"; // Emojis: "fire:"

        // Reconstruct string
        const pre = s.raw.slice(0, s.match.index + 1); // "Hello @"
        const post = s.raw.slice(s.cursorPos); // " how are you"

        // const newText = pre + replacement + (s.match.trigger !== ':' ? " " : "") + post;
        // no space after completion
        const newText = pre + replacement + post;
        
        // Update state
        store.set({ raw: newText, cursorPos: pre.length + replacement.length + 1, match: null, selectedIndex: 0 });
        inspectorStore.setOverride(null);
        return true;
    },

    reset: () => store.set(initialState)
};

// --- HELPER: REGEX PARSER ---
function detectTrigger(text: string, cursor: number): MatchResult | null {
    // Look backwards from cursor for the last @, #, or :
    // It must be preceded by start-of-string or whitespace
    const sub = text.slice(0, cursor);
    const regex = /(^|\s)([@#:])([a-zA-Z0-9_\-]*)$/;
    const found = sub.match(regex);

    if (found) {
        return {
            trigger: found[2] as TriggerType,
            query: found[3],
            index: found.index! + found[1].length // Adjust for capture group 1
        };
    }
    return null;
}

// --- DERIVED: CANDIDATES ---
export const candidates = derived(
    [store, chatStore, users], 
    ([$s, $chat, $users]) => {
        if (!$s.match) return [];
        const q = $s.match.query;

        let source: any[] = [];
        let keys: string[] = [];

        if ($s.match.trigger === '#') {
            source = $chat.availableChannels;
            keys = ['name'];
        } else if ($s.match.trigger === '@') {
            source = $users;
            keys = ['name', 'id'];
        } else if ($s.match.trigger === ':') {
            source = EMOJIS;
            // Emojis are strings, fuzzysort handles strings differently (array of strings)
            if (!q) return source.map(e => ({ obj: e }));
            return fuzzysort.go(q, source).map(res => ({ obj: res.target }));
        }

        if (!q) return source.map(x => ({ obj: x }));
        return fuzzysort.go(q, source, { keys }).map(res => ({ obj: res.obj }));
    }
);

// --- DERIVED: GHOST TEXT ---
// Returns ONLY the suffix to be appended visually
export const ghostText = derived(
    [store, candidates],
    ([$s, $c]) => {
        if (!$s.match || $c.length === 0) return "";
        
        const target = $c[$s.selectedIndex];
        const currentTyped = $s.match.query;
        let targetName: string | undefined = "";

        if ($s.match.trigger === '#') targetName = target.obj.name;
        else if ($s.match.trigger === '@') targetName = target.obj.name;
        else if ($s.match.trigger === ':') targetName = target.obj;
        if (!targetName) return "";
        // If the user typed "gen", and target is "general", ghost is "eral"
        // Case insensitive matching for the prefix
        if (targetName.toLowerCase().startsWith(currentTyped.toLowerCase())) {
            return targetName.slice(currentTyped.length);
        }
        return "";
    }
);
