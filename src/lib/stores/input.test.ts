// src/lib/stores/input.test.ts
// Tests for autocomplete trigger detection and input engine

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { detectTrigger, inputEngine, candidates, ghostText } from './input';
import { chatStore } from './chat';
import { createChannel, createUser, createMessage, resetIdCounter } from '../test/fixtures';

describe('detectTrigger', () => {
    describe('@ mention trigger', () => {
        it('detects @ at start of input', () => {
            const result = detectTrigger('@john', 5);
            expect(result).toEqual({ trigger: '@', query: 'john', index: 0 });
        });

        it('detects @ after space', () => {
            const result = detectTrigger('hello @john', 11);
            expect(result).toEqual({ trigger: '@', query: 'john', index: 6 });
        });

        it('handles empty query after @', () => {
            const result = detectTrigger('@', 1);
            expect(result).toEqual({ trigger: '@', query: '', index: 0 });
        });

        it('handles partial query', () => {
            const result = detectTrigger('@jo', 3);
            expect(result).toEqual({ trigger: '@', query: 'jo', index: 0 });
        });
    });

    describe('# channel trigger', () => {
        it('detects # at start', () => {
            const result = detectTrigger('#general', 8);
            expect(result).toEqual({ trigger: '#', query: 'general', index: 0 });
        });

        it('detects # after space', () => {
            const result = detectTrigger('join #random', 12);
            expect(result).toEqual({ trigger: '#', query: 'random', index: 5 });
        });
    });

    describe('~ channel trigger', () => {
        it('detects ~ at start', () => {
            const result = detectTrigger('~random', 7);
            expect(result).toEqual({ trigger: '~', query: 'random', index: 0 });
        });

        it('detects ~ after space', () => {
            const result = detectTrigger('check ~dev', 10);
            expect(result).toEqual({ trigger: '~', query: 'dev', index: 6 });
        });
    });

    describe(': emoji trigger', () => {
        it('detects : at start', () => {
            const result = detectTrigger(':fire', 5);
            expect(result).toEqual({ trigger: ':', query: 'fire', index: 0 });
        });

        it('detects : after space', () => {
            const result = detectTrigger('great job :thumbs', 17);
            expect(result).toEqual({ trigger: ':', query: 'thumbs', index: 10 });
        });

        it('handles empty query after :', () => {
            const result = detectTrigger(':', 1);
            expect(result).toEqual({ trigger: ':', query: '', index: 0 });
        });
    });

    describe('no trigger cases', () => {
        it('returns null for plain text', () => {
            expect(detectTrigger('hello world', 11)).toBeNull();
        });

        it('continues matching multi-word after trigger', () => {
            // The regex allows spaces in names (like "John Smith")
            // so "@john hello" is treated as a multi-word query
            const result = detectTrigger('@john hello', 11);
            expect(result).toEqual({ trigger: '@', query: 'john hello', index: 0 });
        });

        it('returns null for trigger in middle of word', () => {
            // email address - @ is not preceded by space/start
            expect(detectTrigger('test@example', 12)).toBeNull();
        });

        it('returns null for empty input', () => {
            expect(detectTrigger('', 0)).toBeNull();
        });
    });

    describe('cursor position handling', () => {
        it('only considers text up to cursor position', () => {
            // cursor is at position 3, so only "@jo" is considered
            const result = detectTrigger('@john', 3);
            expect(result).toEqual({ trigger: '@', query: 'jo', index: 0 });
        });

        it('handles cursor at start', () => {
            expect(detectTrigger('@john', 0)).toBeNull();
        });

        it('handles cursor in middle of trigger', () => {
            const result = detectTrigger('@john', 1);
            expect(result).toEqual({ trigger: '@', query: '', index: 0 });
        });
    });

    describe('multi-word queries', () => {
        it('supports space in username', () => {
            const result = detectTrigger('@John Smith', 11);
            expect(result).toEqual({ trigger: '@', query: 'John Smith', index: 0 });
        });

        it('supports space in channel name', () => {
            const result = detectTrigger('#team updates', 13);
            expect(result).toEqual({ trigger: '#', query: 'team updates', index: 0 });
        });
    });

    describe('special characters in query', () => {
        it('allows underscores', () => {
            const result = detectTrigger('@john_doe', 9);
            expect(result).toEqual({ trigger: '@', query: 'john_doe', index: 0 });
        });

        it('allows hyphens', () => {
            const result = detectTrigger('#my-channel', 11);
            expect(result).toEqual({ trigger: '#', query: 'my-channel', index: 0 });
        });

        it('allows dots', () => {
            const result = detectTrigger('@john.doe', 9);
            expect(result).toEqual({ trigger: '@', query: 'john.doe', index: 0 });
        });
    });
});

describe('inputEngine with real stores', () => {
    const service = { id: 'slack', name: 'Slack' };

    beforeEach(() => {
        resetIdCounter();
        chatStore.reset();
        inputEngine.reset();

        // Bootstrap with test users and channels
        const me = createUser('Me', 'slack');
        const general = createChannel({ name: 'general', service });
        const random = createChannel({ name: 'random', service });

        chatStore.setIdentity('slack', me);
        chatStore.upsertChannels([general, random]);
        chatStore.upsertUsers([
            { id: 'u-john', name: 'john', serviceId: 'slack' },
            { id: 'u-jane', name: 'jane', serviceId: 'slack' },
            { id: 'u-bob', name: 'bob', serviceId: 'slack' }
        ]);

        // Switch to a channel in this service so users/channels are scoped correctly
        chatStore.switchChannel(general);
    });

    describe('inputEngine.update()', () => {
        it('sets match when @ trigger detected', () => {
            inputEngine.update('@jo', 3);
            const state = get(inputEngine);

            expect(state.match).not.toBeNull();
            expect(state.match?.trigger).toBe('@');
            expect(state.match?.query).toBe('jo');
        });

        it('sets match when # trigger detected', () => {
            inputEngine.update('#gen', 4);
            const state = get(inputEngine);

            expect(state.match).not.toBeNull();
            expect(state.match?.trigger).toBe('#');
            expect(state.match?.query).toBe('gen');
        });

        it('sets match when : trigger detected', () => {
            inputEngine.update(':fire', 5);
            const state = get(inputEngine);

            expect(state.match).not.toBeNull();
            expect(state.match?.trigger).toBe(':');
            expect(state.match?.query).toBe('fire');
        });

        it('clears match for plain text', () => {
            inputEngine.update('hello world', 11);
            const state = get(inputEngine);

            expect(state.match).toBeNull();
        });

        it('updates raw text and cursor position', () => {
            inputEngine.update('hello', 5);
            const state = get(inputEngine);

            expect(state.raw).toBe('hello');
            expect(state.cursorPos).toBe(5);
        });

        it('resets selectedIndex when trigger changes', () => {
            // Start with @ trigger
            inputEngine.update('@j', 2);
            inputEngine.moveSelection(1); // Move to index 1

            // Change to # trigger - should reset
            inputEngine.update('#g', 2);
            expect(get(inputEngine).selectedIndex).toBe(0);
        });

        it('resets selection to first candidate when query changes', () => {
            // User types "@j", moves selection to second candidate
            inputEngine.update('@j', 2);
            inputEngine.moveSelection(1);
            
            // User continues typing - selection should reset to first match
            // This is the expected UX: as you refine your search, start fresh
            inputEngine.update('@jo', 3);
            
            // The first candidate should now be selected
            const list = get(candidates);
            expect(list.length).toBeGreaterThan(0);
            expect(get(inputEngine).selectedIndex).toBe(0);
        });
    });

    describe('inputEngine.moveSelection()', () => {
        it('moves selection down', () => {
            inputEngine.update('@', 1); // Empty query gets all users
            inputEngine.moveSelection(1);

            expect(get(inputEngine).selectedIndex).toBe(1);
        });

        it('moves selection up', () => {
            inputEngine.update('@', 1);
            inputEngine.moveSelection(1);
            inputEngine.moveSelection(1);
            inputEngine.moveSelection(-1);

            expect(get(inputEngine).selectedIndex).toBe(1);
        });

        it('wraps around at end of list', () => {
            inputEngine.update('@', 1);
            const numCandidates = get(candidates).length;
            
            // Moving past the last item should wrap to first
            inputEngine.moveSelection(numCandidates);
            expect(get(inputEngine).selectedIndex).toBe(0);
        });

        it('wraps around at start of list', () => {
            inputEngine.update('@', 1);
            const numCandidates = get(candidates).length;
            
            // Moving before first item should wrap to last
            inputEngine.moveSelection(-1);
            expect(get(inputEngine).selectedIndex).toBe(numCandidates - 1);
        });

        it('does nothing when no candidates', () => {
            inputEngine.update('hello', 5); // No trigger
            inputEngine.moveSelection(1);

            expect(get(inputEngine).selectedIndex).toBe(0);
        });
    });

    describe('inputEngine.reset()', () => {
        it('clears input and closes autocomplete', () => {
            inputEngine.update('@john', 5);
            inputEngine.moveSelection(1);

            inputEngine.reset();

            // Input should be cleared
            expect(get(inputEngine).raw).toBe('');
            // Autocomplete should be closed (no candidates)
            expect(get(candidates)).toEqual([]);
            // Ghost text should be empty
            expect(get(ghostText)).toBe('');
        });
    });

    describe('candidates derived store', () => {
        it('returns empty array when no match', () => {
            inputEngine.update('hello world', 11);
            expect(get(candidates)).toEqual([]);
        });

        it('returns matching users on @ trigger', () => {
            inputEngine.update('@jo', 3);
            const list = get(candidates);

            expect(list.length).toBeGreaterThan(0);
            expect(list.some(c => c.obj.name === 'john')).toBe(true);
        });

        it('filters users by query', () => {
            inputEngine.update('@ja', 3);
            const list = get(candidates);

            // Should match 'jane' but not 'john' or 'bob'
            expect(list.some(c => c.obj.name === 'jane')).toBe(true);
            expect(list.some(c => c.obj.name === 'john')).toBe(false);
        });

        it('returns matching channels on # trigger', () => {
            inputEngine.update('#gen', 4);
            const list = get(candidates);

            expect(list.length).toBeGreaterThan(0);
            expect(list.some(c => c.obj.name === 'general')).toBe(true);
        });

        it('returns matching channels on ~ trigger', () => {
            inputEngine.update('~ran', 4);
            const list = get(candidates);

            expect(list.length).toBeGreaterThan(0);
            expect(list.some(c => c.obj.name === 'random')).toBe(true);
        });

        it('returns emojis on : trigger', () => {
            inputEngine.update(':fire', 5);
            const list = get(candidates);

            expect(list.length).toBeGreaterThan(0);
            // emojibase uses 'fire' as the id
            expect(list.some(c => c.obj.id === 'fire')).toBe(true);
        });

        it('returns all users when query is empty', () => {
            inputEngine.update('@', 1);
            const list = get(candidates);

            // Should include all registered users
            expect(list.some(c => c.obj.name === 'john')).toBe(true);
            expect(list.some(c => c.obj.name === 'jane')).toBe(true);
            expect(list.some(c => c.obj.name === 'bob')).toBe(true);
        });
    });

    describe('ghostText derived store', () => {
        it('returns empty string when no match', () => {
            inputEngine.update('hello', 5);
            expect(get(ghostText)).toBe('');
        });

        it('shows completion for partial username', () => {
            inputEngine.update('@joh', 4);
            const ghost = get(ghostText);

            // If 'john' is the top match, ghost should be 'n'
            expect(ghost).toBe('n');
        });

        it('shows completion for partial channel', () => {
            inputEngine.update('#gen', 4);
            const ghost = get(ghostText);

            // 'general' completion should be 'eral'
            expect(ghost).toBe('eral');
        });

        it('shows completion for partial emoji', () => {
            inputEngine.update(':fir', 4);
            const ghost = get(ghostText);

            // 'fire' completion should be 'e'
            expect(ghost).toBe('e');
        });

        it('returns empty when query does not prefix match', () => {
            // Type something that matches via fuzzy but not prefix
            inputEngine.update('@xyz', 4);
            expect(get(ghostText)).toBe('');
        });
    });

    describe('inputEngine.resolve()', () => {
        it('returns false when no match', () => {
            inputEngine.update('hello', 5);
            expect(inputEngine.resolve()).toBe(false);
        });

        it('returns false when no candidates', () => {
            inputEngine.update('@zzzznonexistent', 16);
            expect(inputEngine.resolve()).toBe(false);
        });

        it('resolves @mention and inserts username with space', () => {
            inputEngine.update('@joh', 4);
            const result = inputEngine.resolve();

            expect(result).toBe(true);
            const state = get(inputEngine);
            expect(state.raw).toBe('@john ');
            expect(state.match).toBeNull();
        });

        it('resolves #channel correctly', () => {
            inputEngine.update('#gen', 4);
            const result = inputEngine.resolve();

            expect(result).toBe(true);
            const state = get(inputEngine);
            // The resolved text depends on user's channel prefix setting
            expect(state.raw).toMatch(/[#~]general /);
            expect(state.match).toBeNull();
        });

        it('resolves :emoji: with unicode character', () => {
            inputEngine.update(':fire', 5);
            const result = inputEngine.resolve();

            expect(result).toBe(true);
            const state = get(inputEngine);
            // Fire emoji: U+1F525
            expect(state.raw).toContain('\u{1F525}');
            expect(state.match).toBeNull();
        });

        it('positions cursor after resolved text', () => {
            inputEngine.update('@joh', 4);
            inputEngine.resolve();

            const state = get(inputEngine);
            // Cursor should be at end of resolved text, ready to continue typing
            expect(state.cursorPos).toBe(state.raw.length);
        });

        it('preserves text before trigger when resolving', () => {
            inputEngine.update('hello @joh', 10);
            inputEngine.resolve();

            const state = get(inputEngine);
            expect(state.raw).toBe('hello @john ');
        });

        it('preserves text after cursor when resolving', () => {
            // Simulate typing in middle: "hello @joh| world"
            // Where | is cursor at position 10
            inputEngine.update('hello @johworld', 10);
            inputEngine.resolve();

            const state = get(inputEngine);
            expect(state.raw).toBe('hello @john world');
        });

        it('resets selectedIndex after resolve', () => {
            inputEngine.update('@j', 2);
            inputEngine.moveSelection(1);
            expect(get(inputEngine).selectedIndex).toBe(1);

            inputEngine.resolve();
            expect(get(inputEngine).selectedIndex).toBe(0);
        });
    });

    describe('autocomplete with spellcheck scenarios', () => {
        // These tests verify autocomplete works correctly in contexts where
        // browser spellcheck might show red underlines (misspelled words).
        // The autocomplete logic should be unaffected by spellcheck.

        it('@ trigger works after misspelled word', () => {
            // "teh" is commonly flagged by spellcheck
            inputEngine.update('teh @jo', 7);
            const state = get(inputEngine);

            expect(state.match?.trigger).toBe('@');
            expect(state.match?.query).toBe('jo');
            expect(get(candidates).length).toBeGreaterThan(0);
        });

        it('# trigger works after misspelled word', () => {
            inputEngine.update('chekc #gen', 10);
            const state = get(inputEngine);

            expect(state.match?.trigger).toBe('#');
            expect(state.match?.query).toBe('gen');
        });

        it(': trigger works in sentence with typos', () => {
            inputEngine.update('thsi is gr8 :thu', 16);
            const state = get(inputEngine);

            expect(state.match?.trigger).toBe(':');
            expect(state.match?.query).toBe('thu');
        });

        it('resolve works correctly after misspelled text', () => {
            inputEngine.update('teh @joh', 8);
            inputEngine.resolve();

            const state = get(inputEngine);
            // The misspelled "teh" should be preserved
            expect(state.raw).toBe('teh @john ');
        });

        it('multiple triggers in text with typos', () => {
            // First mention, then type more with typo, then another mention
            inputEngine.update('hey @john teh ', 14);
            expect(get(inputEngine).match).toBeNull();

            // Now add another trigger
            inputEngine.update('hey @john teh @ja', 17);
            const state = get(inputEngine);

            expect(state.match?.trigger).toBe('@');
            expect(state.match?.query).toBe('ja');
        });

        it('channel trigger after emoji and typo', () => {
            inputEngine.update(':fire: somethng #ran', 20);
            const state = get(inputEngine);

            expect(state.match?.trigger).toBe('#');
            expect(state.match?.query).toBe('ran');
        });
    });
});

describe('mention suggestions prioritize active channel participants', () => {
    const service = { id: 'slack', name: 'Slack' };

    beforeEach(() => {
        resetIdCounter();
        chatStore.reset();
        inputEngine.reset();
    });

    it('shows users who posted in channel before other users', () => {
        // Setup: alice and bob have posted in the channel, charlie and dana have not
        // NOTE: We insert users in alphabetical order, but expect channel participants first
        const me = createUser('Me', 'slack');
        const alice = { id: 'u-alice', name: 'alice', serviceId: 'slack' };
        const bob = { id: 'u-bob', name: 'bob', serviceId: 'slack' };
        const charlie = { id: 'u-charlie', name: 'charlie', serviceId: 'slack' };
        const dana = { id: 'u-dana', name: 'dana', serviceId: 'slack' };

        const channel = createChannel({ name: 'general', service });

        chatStore.setIdentity('slack', me);
        chatStore.upsertChannels([channel]);
        // Insert in order that would NOT naturally put alice/bob first
        chatStore.upsertUsers([charlie, dana, alice, bob]);
        chatStore.switchChannel(channel);

        // Alice and Bob have posted messages in the channel
        chatStore.dispatchMessage(channel, createMessage({ author: alice, content: 'hello' }));
        chatStore.dispatchMessage(channel, createMessage({ author: bob, content: 'hi there' }));

        // Type @ to see all users
        inputEngine.update('@', 1);
        const list = get(candidates);

        // Get the names in order
        const names = list.map(c => c.obj.name);

        // alice and bob should appear before charlie and dana
        const aliceIdx = names.indexOf('alice');
        const bobIdx = names.indexOf('bob');
        const charlieIdx = names.indexOf('charlie');
        const danaIdx = names.indexOf('dana');

        expect(aliceIdx).toBeLessThan(charlieIdx);
        expect(aliceIdx).toBeLessThan(danaIdx);
        expect(bobIdx).toBeLessThan(charlieIdx);
        expect(bobIdx).toBeLessThan(danaIdx);
    });

    it('prioritizes channel participants when filtering by query', () => {
        // Setup: alice posted in channel, alex did not - both match "al"
        const me = createUser('Me', 'slack');
        const alice = { id: 'u-alice', name: 'alice', serviceId: 'slack' };
        const alex = { id: 'u-alex', name: 'alex', serviceId: 'slack' };

        const channel = createChannel({ name: 'general', service });

        chatStore.setIdentity('slack', me);
        chatStore.upsertChannels([channel]);
        chatStore.upsertUsers([alice, alex]);
        chatStore.switchChannel(channel);

        // Only alice has posted in the channel
        chatStore.dispatchMessage(channel, createMessage({ author: alice, content: 'hello' }));

        // Type @al - both alice and alex match
        inputEngine.update('@al', 3);
        const list = get(candidates);
        const names = list.map(c => c.obj.name);

        // alice should appear before alex (she's a channel participant)
        expect(names.indexOf('alice')).toBeLessThan(names.indexOf('alex'));
    });

    it('still shows all users even if they have not posted', () => {
        // Setup: only alice has posted, but bob should still be in the list
        const me = createUser('Me', 'slack');
        const alice = { id: 'u-alice', name: 'alice', serviceId: 'slack' };
        const bob = { id: 'u-bob', name: 'bob', serviceId: 'slack' };

        const channel = createChannel({ name: 'general', service });

        chatStore.setIdentity('slack', me);
        chatStore.upsertChannels([channel]);
        chatStore.upsertUsers([alice, bob]);
        chatStore.switchChannel(channel);

        // Only alice has posted
        chatStore.dispatchMessage(channel, createMessage({ author: alice, content: 'hello' }));

        // Type @ to see all users
        inputEngine.update('@', 1);
        const list = get(candidates);
        const names = list.map(c => c.obj.name);

        // Both users should be in the list
        expect(names).toContain('alice');
        expect(names).toContain('bob');
    });

    it('shows all users when channel has no messages', () => {
        // Setup: empty channel
        const me = createUser('Me', 'slack');
        const alice = { id: 'u-alice', name: 'alice', serviceId: 'slack' };
        const bob = { id: 'u-bob', name: 'bob', serviceId: 'slack' };

        const channel = createChannel({ name: 'general', service });

        chatStore.setIdentity('slack', me);
        chatStore.upsertChannels([channel]);
        chatStore.upsertUsers([alice, bob]);
        chatStore.switchChannel(channel);

        // No messages in channel

        // Type @ to see all users
        inputEngine.update('@', 1);
        const list = get(candidates);
        const names = list.map(c => c.obj.name);

        // Both users should be available
        expect(names).toContain('alice');
        expect(names).toContain('bob');
    });

    it('prioritizes thread participants when in a thread', () => {
        // Setup: alice posted in main channel, bob replied in thread, charlie never posted
        const me = createUser('Me', 'slack');
        const alice = { id: 'u-alice', name: 'alice', serviceId: 'slack' };
        const bob = { id: 'u-bob', name: 'bob', serviceId: 'slack' };
        const charlie = { id: 'u-charlie', name: 'charlie', serviceId: 'slack' };

        const channel = createChannel({ name: 'general', service });

        chatStore.setIdentity('slack', me);
        chatStore.upsertChannels([channel]);
        // Insert charlie first so he would naturally appear first without prioritization
        chatStore.upsertUsers([charlie, alice, bob]);
        chatStore.switchChannel(channel);

        // Alice posts the root message
        const rootMsg = createMessage({ id: 'root-1', author: alice, content: 'hello' });
        chatStore.dispatchMessage(channel, rootMsg);

        // Open thread and bob replies
        chatStore.openThread(rootMsg);

        // Bob replies in the thread
        const threadChannel = get(chatStore).activeChannel;
        chatStore.dispatchMessage(threadChannel, createMessage({ 
            author: bob, 
            content: 'reply',
            threadId: 'root-1'
        }));

        // Now in thread context, type @ 
        inputEngine.update('@', 1);
        const list = get(candidates);
        const names = list.map(c => c.obj.name);

        // bob posted in this thread, charlie did not
        // bob should appear before charlie
        expect(names.indexOf('bob')).toBeLessThan(names.indexOf('charlie'));
    });
});
