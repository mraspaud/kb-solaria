// src/lib/stores/input.ts

import { writable, derived, get } from 'svelte/store';
import { chatStore } from './chat';
import { inspectorStore } from './inspector';
import fuzzysort from 'fuzzysort';

export type TriggerType = '@' | '#' | '~' | ':' | null;

interface MatchResult {
    trigger: TriggerType;
    query: string;
    index: number;
}

interface InputState {
    raw: string;
    cursorPos: number;
    match: MatchResult | null;
    selectedIndex: number;
}

const EMOJIS = ["thumbsup", "thumbsdown", "fire", "rocket", "eyes", "check_mark", "x", "tada", "joy", "heart", "sob", "thinking"];

// 1. SCOPED USERS (Filtered by Service)
export const users = derived(chatStore, $s => {
    const activeServiceId = $s.activeChannel.service.id;
    return Array.from($s.users.values()).filter(u => {
        // Strict Scoping: Only show users from the current service
        return u.serviceId === activeServiceId || !u.serviceId; 
    });
});

function escapeRegex(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 2. SCOPED REGEX (Uses filtered users + filtered channels)
export const entityRegex = derived(
    [users, chatStore], 
    ([$users, $chat]) => {
        const activeServiceId = $chat.activeChannel.service.id;
        
        // Filter Channels by Service
        const channelNames = $chat.availableChannels
            .filter(c => c.service.id === activeServiceId)
            .map(c => c.name);
            
        const userNames = $users.map(u => u.name);
        
        userNames.sort((a, b) => b.length - a.length);
        channelNames.sort((a, b) => b.length - a.length);

        if (userNames.length === 0 && channelNames.length === 0) return null;

        const userGroup = userNames.map(escapeRegex).join('|');
        const chanGroup = channelNames.map(escapeRegex).join('|');
        
        let pattern = "";
        if (userGroup) pattern += `(@)(${userGroup})`;
        if (userGroup && chanGroup) pattern += "|";
        // Match BOTH # and ~ for channels
        if (chanGroup) pattern += `([#~])(${chanGroup})`;

        return new RegExp(pattern, 'g');
    }
);

const initialState: InputState = { raw: "", cursorPos: 0, match: null, selectedIndex: 0 };
const store = writable<InputState>(initialState);

// 3. UPDATED TRIGGER DETECTION (Supports ~)
function detectTrigger(text: string, cursor: number): MatchResult | null {
    const sub = text.slice(0, cursor);
    // Allow ~ in the trigger group
    const regex = /(^|\s)([@#:~])((?:[a-zA-Z0-9_\-\.]+(?: [a-zA-Z0-9_\-\.]+)*)?)$/;
    const found = sub.match(regex);

    if (found) {
        return {
            trigger: found[2] as TriggerType,
            query: found[3],
            index: found.index! + found[1].length
        };
    }
    return null;
}

export const inputEngine = {
    subscribe: store.subscribe,

    update: (raw: string, cursorPos: number) => {
        let match = detectTrigger(raw, cursorPos);
        
        // Semantic Guard (Service Aware)
        if (match && match.query.includes(' ')) {
            const currentUsers = get(users); // Already filtered
            const activeServiceId = get(chatStore).activeChannel.service.id;
            const currentChannels = get(chatStore).availableChannels.filter(c => c.service.id === activeServiceId);
            
            const q = match.query.toLowerCase();
            let isValidPrefix = false;

            if (match.trigger === '@') {
                isValidPrefix = currentUsers.some(u => u.name.toLowerCase().startsWith(q));
            } else if (match.trigger === '#' || match.trigger === '~') {
                isValidPrefix = currentChannels.some(c => c.name.toLowerCase().startsWith(q));
            }

            if (!isValidPrefix) match = null;
        }
        
        store.update(s => {
            const isNewMatch = JSON.stringify(match) !== JSON.stringify(s.match);
            return {
                raw, 
                cursorPos, 
                match, 
                selectedIndex: isNewMatch ? 0 : s.selectedIndex
            };
        });

        if (match) inspectorStore.setOverride('DIRECTORY');
        else if (get(inspectorStore) === 'DIRECTORY') inspectorStore.setOverride(null);
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
    
    resolve: () => {
        const s = get(store);
        const list = get(candidates);
        if (!s.match || list.length === 0) return false;

        const target = list[s.selectedIndex];
        let replacement = "";
        
        // SMART RESOLVE
        if (s.match.trigger === '#' || s.match.trigger === '~') {
            // Try to get prefix from Identity, fallback to what user typed
            const identity = get(chatStore).currentUser;
            const prefix = identity?.channelPrefix || s.match.trigger;
            replacement = prefix + target.obj.name;
        }
        else if (s.match.trigger === '@') replacement = "@" + target.obj.name; // Always enforce @
        else if (s.match.trigger === ':') replacement = target.obj + ":";

        // Remove the original trigger + query
        const pre = s.raw.slice(0, s.match.index); 
        const post = s.raw.slice(s.cursorPos); 
        
        const suffix = (s.match.trigger !== ':') ? " " : "";
        const newText = pre + replacement + suffix + post;
        const newCursorPos = pre.length + replacement.length + suffix.length;

        store.set({ raw: newText, cursorPos: newCursorPos, match: null, selectedIndex: 0 });
        inspectorStore.setOverride(null);
        return true;
    },

    reset: () => store.set(initialState)
};

// 4. SCOPED CANDIDATES (Filtered by Service)
export const candidates = derived(
    [store, chatStore, users], 
    ([$s, $chat, $users]) => {
        if (!$s.match) return [];
        const q = $s.match.query;
        const activeServiceId = $chat.activeChannel.service.id;

        let source: any[] = [];
        let keys: string[] = [];

        // Handle # AND ~ triggers
        if ($s.match.trigger === '#' || $s.match.trigger === '~') {
            // Filter channels by active service
            source = $chat.availableChannels.filter(c => c.service.id === activeServiceId);
            keys = ['name'];
        } 
        else if ($s.match.trigger === '@') {
            source = $users; // Already filtered by 'users' derived store
            keys = ['name', 'id'];
        } 
        else if ($s.match.trigger === ':') {
            source = EMOJIS;
            if (!q) return source.map(e => ({ obj: e }));
            return fuzzysort.go(q, source).map(res => ({ obj: res.target }));
        }

        if (!q) return source.map(x => ({ obj: x }));
        return fuzzysort.go(q, source, { keys }).map(res => ({ obj: res.obj }));
    }
);

export const ghostText = derived(
    [store, candidates],
    ([$s, $c]) => {
        if (!$s.match || $c.length === 0) return "";
        const target = $c[$s.selectedIndex];
        const currentTyped = $s.match.query;
        let targetName: string | undefined = "";

        if ($s.match.trigger === '#' || $s.match.trigger === '~') targetName = target.obj.name;
        else if ($s.match.trigger === '@') targetName = target.obj.name;
        else if ($s.match.trigger === ':') targetName = target.obj;

        if (!targetName) return ""; 
        if (targetName.toLowerCase().startsWith(currentTyped.toLowerCase())) {
            return targetName.slice(currentTyped.length);
        }
        return "";
    }
);
