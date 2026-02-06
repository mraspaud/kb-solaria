import { writable, derived, get } from 'svelte/store';
import { chatStore } from './chat';
import { inspectorStore } from './inspector';
import { allEmojis, type Emoji } from './emoji'; 
import fuzzysort from 'fuzzysort';

export type TriggerType = '@' | '#' | '~' | ':' | null;

export interface MatchResult {
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

export interface PendingAttachment {
    clientId: string;
    name: string;
    status: 'uploading' | 'ready' | 'failed';
    remoteId?: string; // The ID returned by the backend
}

export const attachments = writable<PendingAttachment[]>([]);


// 1. SCOPED USERS (Filtered by Service)
export const users = derived(chatStore, $s => {
    const activeServiceId = $s.activeChannel.service.id;
    return Array.from($s.users.values()).filter(u => {
        return u.serviceId === activeServiceId || !u.serviceId; 
    });
});

// 1b. CHANNEL AUTHORS - users who have posted in the current channel/thread
const channelAuthors = derived(chatStore, $s => {
    const seen = new Set<string>();
    for (const msg of $s.messages) {
        seen.add(msg.author.id);
    }
    return seen;
});

function escapeRegex(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 2. SCOPED REGEX (Uses filtered users + filtered channels)
export const entityRegex = derived(
    [users, chatStore], 
    ([$users, $chat]) => {
        const activeServiceId = $chat.activeChannel.service.id;
        
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
        if (chanGroup) pattern += `([#~])(${chanGroup})`;

        return new RegExp(pattern, 'g');
    }
);

const initialState: InputState = { raw: "", cursorPos: 0, match: null, selectedIndex: 0 };
const store = writable<InputState>(initialState);

// 3. UPDATED TRIGGER DETECTION (exported for testing)
export function detectTrigger(text: string, cursor: number): MatchResult | null {
    const sub = text.slice(0, cursor);
    // Added ':' to the regex character set
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
            const currentUsers = get(users);
            const activeServiceId = get(chatStore).activeChannel.service.id;
            const currentChannels = get(chatStore).availableChannels.filter(c => c.service.id === activeServiceId);
            
            const q = match.query.toLowerCase();
            let isValidPrefix = false;

            if (match.trigger === '@') {
                isValidPrefix = currentUsers.some(u => u.name.toLowerCase().startsWith(q));
            } else if (match.trigger === '#' || match.trigger === '~') {
                isValidPrefix = currentChannels.some(c => c.name.toLowerCase().startsWith(q));
            }
            // Colon triggers (emojis) generally don't have spaces, 
            // but if they do, we assume it's invalid unless your logic supports "thumbs up"
            else if (match.trigger === ':') {
                 isValidPrefix = false; 
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

        // SMART RESOLVE - use type assertions since we know the type based on trigger
        if (s.match.trigger === '#' || s.match.trigger === '~') {
            const identity = get(chatStore).currentUser;
            const prefix = identity?.channelPrefix || s.match.trigger;
            const channel = target.obj as { name: string };
            replacement = prefix + channel.name;
        }
        else if (s.match.trigger === '@') {
            const user = target.obj as { name: string };
            replacement = "@" + user.name;
        }
        else if (s.match.trigger === ':') {
            const emoji = target.obj as Emoji;
            if (emoji.isCustom) {
                // Custom emojis insert the shortcode + space
                replacement = `:${emoji.id}: `; 
            } else {
                // Standard emojis insert the Unicode Character + space
                replacement = `${emoji.char} `;
            }
        }

        const pre = s.raw.slice(0, s.match.index);
        const post = s.raw.slice(s.cursorPos); 
        
        const suffix = (s.match.trigger !== ':') ? " " : ""; 
        // Note: We handled the space manually for emojis above to avoid double spaces if needed,
        // but adding 'suffix' here effectively adds a second space for non-colon triggers.
        // Let's keep existing behavior for @/# and use the manual logic for :.
        
        const finalSpace = (s.match.trigger === ':') ? "" : " ";

        const newText = pre + replacement + finalSpace + post;
        const newCursorPos = pre.length + replacement.length + finalSpace.length;

        store.set({ raw: newText, cursorPos: newCursorPos, match: null, selectedIndex: 0 });
        inspectorStore.setOverride(null);
        return true;
    },

    reset: () => store.set(initialState)
};

// 4. CANDIDATES - autocomplete suggestions based on trigger type
export const candidates = derived(
    [store, chatStore, users, allEmojis, channelAuthors], 
    ([$s, $chat, $users, $emojis, $channelAuthors]) => {
        if (!$s.match) return [];
        const q = $s.match.query.toLowerCase();
        const activeServiceId = $chat.activeChannel.service.id;

        // Channel triggers: #general, ~random
        if ($s.match.trigger === '#' || $s.match.trigger === '~') {
            const channels = $chat.availableChannels.filter(c => c.service.id === activeServiceId);
            if (!q) return channels.map(c => ({ obj: c }));
            return fuzzysort.go(q, channels, { keys: ['name'] }).map(r => ({ obj: r.obj }));
        }
        
        // Mention trigger: @username
        // Prioritize users who have posted in the current channel/thread
        if ($s.match.trigger === '@') {
            const inChannel = $users.filter(u => $channelAuthors.has(u.id));
            const notInChannel = $users.filter(u => !$channelAuthors.has(u.id));
            const keys = ['name', 'id'];
            
            if (!q) {
                return [...inChannel, ...notInChannel].map(u => ({ obj: u }));
            }
            
            const inChannelResults = fuzzysort.go(q, inChannel, { keys });
            const notInChannelResults = fuzzysort.go(q, notInChannel, { keys });
            
            return [
                ...inChannelResults.map(r => ({ obj: r.obj })),
                ...notInChannelResults.map(r => ({ obj: r.obj }))
            ];
        }
        
        // Emoji trigger: :fire
        if ($s.match.trigger === ':') {
            if (!q) return $emojis.slice(0, 20).map(e => ({ obj: e }));
            
            return fuzzysort.go(q, $emojis, { 
                keys: ['id', 'keywords'], 
                threshold: -10000,
                limit: 15
            }).map(r => ({ obj: r.obj }));
        }

        return [];
    }
);

export const ghostText = derived(
    [store, candidates],
    ([$s, $c]) => {
        if (!$s.match || $c.length === 0) return "";
        const target = $c[$s.selectedIndex];
        const currentTyped = $s.match.query;
        let targetName: string | undefined = "";

        // Use type assertions since we know the type based on trigger
        if ($s.match.trigger === '#' || $s.match.trigger === '~') {
            targetName = (target.obj as { name: string }).name;
        } else if ($s.match.trigger === '@') {
            targetName = (target.obj as { name: string }).name;
        } else if ($s.match.trigger === ':') {
            targetName = (target.obj as { id: string }).id;
        }

        if (!targetName) return ""; 
        if (targetName.toLowerCase().startsWith(currentTyped.toLowerCase())) {
            return targetName.slice(currentTyped.length);
        }
        return "";
    }
);
