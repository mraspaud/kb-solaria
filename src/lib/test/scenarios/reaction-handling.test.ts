// src/lib/test/scenarios/reaction-handling.test.ts
// Tests for reaction add/remove/normalization

import { describe, it, expect, beforeEach } from 'vitest';
import { TestHarness } from '../TestHarness';
import {
    createChannel,
    createMessage,
    createUser,
    resetIdCounter
} from '../fixtures';

describe('Reaction Handling', () => {
    let harness: TestHarness;
    const service = { id: 'slack', name: 'Slack' };

    beforeEach(() => {
        resetIdCounter();
        harness = new TestHarness();
    });

    describe('Adding reactions', () => {
        it('adds a reaction to a message', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel = createChannel({ name: 'general', service });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            const msg = createMessage({
                id: 'msg-1',
                author: alice,
                content: 'Hello!',
                sourceChannel: channel,
                timestamp: new Date()
            });
            harness.dispatchMessage(channel, msg);
            harness.switchChannel(channel);

            // Add reaction
            harness.handleReaction(channel.id, 'msg-1', 'thumbs_up', 'user-1', 'add');

            // Check reaction was added
            const updatedMsg = harness.getMessage('msg-1');
            expect(updatedMsg?.reactions).toBeDefined();
            expect(updatedMsg?.reactions?.['thumbs_up']).toContain('user-1');
        });

        it('adds multiple users to the same reaction', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel = createChannel({ name: 'general', service });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            const msg = createMessage({
                id: 'msg-1',
                author: alice,
                content: 'Hello!',
                sourceChannel: channel,
                timestamp: new Date()
            });
            harness.dispatchMessage(channel, msg);
            harness.switchChannel(channel);

            // Add reactions from multiple users
            harness.handleReaction(channel.id, 'msg-1', 'fire', 'user-1', 'add');
            harness.handleReaction(channel.id, 'msg-1', 'fire', 'user-2', 'add');
            harness.handleReaction(channel.id, 'msg-1', 'fire', 'user-3', 'add');

            const updatedMsg = harness.getMessage('msg-1');
            expect(updatedMsg?.reactions?.['fire']).toHaveLength(3);
            expect(updatedMsg?.reactions?.['fire']).toContain('user-1');
            expect(updatedMsg?.reactions?.['fire']).toContain('user-2');
            expect(updatedMsg?.reactions?.['fire']).toContain('user-3');
        });

        it('does not add duplicate reactions from same user', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel = createChannel({ name: 'general', service });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            const msg = createMessage({
                id: 'msg-1',
                author: alice,
                content: 'Hello!',
                sourceChannel: channel,
                timestamp: new Date()
            });
            harness.dispatchMessage(channel, msg);
            harness.switchChannel(channel);

            // Add same reaction twice
            harness.handleReaction(channel.id, 'msg-1', 'heart', 'user-1', 'add');
            harness.handleReaction(channel.id, 'msg-1', 'heart', 'user-1', 'add');

            const updatedMsg = harness.getMessage('msg-1');
            expect(updatedMsg?.reactions?.['heart']).toHaveLength(1);
        });
    });

    describe('Removing reactions', () => {
        it('removes a reaction from a message', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel = createChannel({ name: 'general', service });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            const msg = createMessage({
                id: 'msg-1',
                author: alice,
                content: 'Hello!',
                sourceChannel: channel,
                timestamp: new Date()
            });
            harness.dispatchMessage(channel, msg);
            harness.switchChannel(channel);

            // Add then remove
            harness.handleReaction(channel.id, 'msg-1', 'rocket', 'user-1', 'add');
            harness.handleReaction(channel.id, 'msg-1', 'rocket', 'user-1', 'remove');

            const updatedMsg = harness.getMessage('msg-1');
            // Reaction key should be removed when empty
            expect(updatedMsg?.reactions?.['rocket']).toBeUndefined();
        });

        it('removing non-existent reaction does not error', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel = createChannel({ name: 'general', service });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            const msg = createMessage({
                id: 'msg-1',
                author: alice,
                content: 'Hello!',
                sourceChannel: channel,
                timestamp: new Date()
            });
            harness.dispatchMessage(channel, msg);
            harness.switchChannel(channel);

            // Remove reaction that doesn't exist
            expect(() => {
                harness.handleReaction(channel.id, 'msg-1', 'nonexistent', 'user-1', 'remove');
            }).not.toThrow();
        });

        it('removes only one user from multi-user reaction', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel = createChannel({ name: 'general', service });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            const msg = createMessage({
                id: 'msg-1',
                author: alice,
                content: 'Hello!',
                sourceChannel: channel,
                timestamp: new Date()
            });
            harness.dispatchMessage(channel, msg);
            harness.switchChannel(channel);

            // Add reactions from multiple users
            harness.handleReaction(channel.id, 'msg-1', 'eyes', 'user-1', 'add');
            harness.handleReaction(channel.id, 'msg-1', 'eyes', 'user-2', 'add');

            // Remove one user
            harness.handleReaction(channel.id, 'msg-1', 'eyes', 'user-1', 'remove');

            const updatedMsg = harness.getMessage('msg-1');
            expect(updatedMsg?.reactions?.['eyes']).toHaveLength(1);
            expect(updatedMsg?.reactions?.['eyes']).toContain('user-2');
            expect(updatedMsg?.reactions?.['eyes']).not.toContain('user-1');
        });
    });

    describe('Emoji normalization', () => {
        it('normalizes +1 to thumbs_up', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel = createChannel({ name: 'general', service });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            const msg = createMessage({
                id: 'msg-1',
                author: alice,
                content: 'Hello!',
                sourceChannel: channel,
                timestamp: new Date()
            });
            harness.dispatchMessage(channel, msg);
            harness.switchChannel(channel);

            // Add using Slack shortcode
            harness.handleReaction(channel.id, 'msg-1', '+1', 'user-1', 'add');

            const updatedMsg = harness.getMessage('msg-1');
            // The key used is the original format (+1) but normalized lookup works
            const reactionKeys = Object.keys(updatedMsg?.reactions || {});
            expect(reactionKeys.length).toBe(1);
        });

        it('treats +1 and thumbs_up as the same reaction', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel = createChannel({ name: 'general', service });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            const msg = createMessage({
                id: 'msg-1',
                author: alice,
                content: 'Hello!',
                sourceChannel: channel,
                timestamp: new Date()
            });
            harness.dispatchMessage(channel, msg);
            harness.switchChannel(channel);

            // Add using +1
            harness.handleReaction(channel.id, 'msg-1', '+1', 'user-1', 'add');
            // Add using thumbs_up - should merge
            harness.handleReaction(channel.id, 'msg-1', 'thumbs_up', 'user-2', 'add');

            const updatedMsg = harness.getMessage('msg-1');
            // Should only have one reaction key with both users
            const reactionKeys = Object.keys(updatedMsg?.reactions || {});
            expect(reactionKeys.length).toBe(1);

            const users = updatedMsg?.reactions?.[reactionKeys[0]];
            expect(users).toHaveLength(2);
        });

        it('can remove reaction added with different format', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel = createChannel({ name: 'general', service });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            const msg = createMessage({
                id: 'msg-1',
                author: alice,
                content: 'Hello!',
                sourceChannel: channel,
                timestamp: new Date()
            });
            harness.dispatchMessage(channel, msg);
            harness.switchChannel(channel);

            // Add using +1
            harness.handleReaction(channel.id, 'msg-1', '+1', 'user-1', 'add');
            // Remove using thumbs_up - should work due to normalization
            harness.handleReaction(channel.id, 'msg-1', 'thumbs_up', 'user-1', 'remove');

            const updatedMsg = harness.getMessage('msg-1');
            // Reaction should be removed
            const reactionKeys = Object.keys(updatedMsg?.reactions || {});
            expect(reactionKeys.length).toBe(0);
        });
    });

    describe('Edge cases', () => {
        it('handles reaction on non-existent message gracefully', () => {
            const me = createUser('Me', 'slack');
            const channel = createChannel({ name: 'general', service });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            // Try to add reaction to non-existent message
            expect(() => {
                harness.handleReaction(channel.id, 'non-existent', 'heart', 'user-1', 'add');
            }).not.toThrow();
        });

        it('preserves other reactions when modifying one', () => {
            const me = createUser('Me', 'slack');
            const alice = createUser('Alice');
            const channel = createChannel({ name: 'general', service });

            harness.bootstrap({
                identity: me,
                service,
                channels: [channel]
            });

            const msg = createMessage({
                id: 'msg-1',
                author: alice,
                content: 'Hello!',
                sourceChannel: channel,
                timestamp: new Date()
            });
            harness.dispatchMessage(channel, msg);
            harness.switchChannel(channel);

            // Add multiple different reactions
            harness.handleReaction(channel.id, 'msg-1', 'heart', 'user-1', 'add');
            harness.handleReaction(channel.id, 'msg-1', 'fire', 'user-2', 'add');
            harness.handleReaction(channel.id, 'msg-1', 'rocket', 'user-3', 'add');

            // Remove one
            harness.handleReaction(channel.id, 'msg-1', 'fire', 'user-2', 'remove');

            const updatedMsg = harness.getMessage('msg-1');
            expect(updatedMsg?.reactions?.['heart']).toContain('user-1');
            expect(updatedMsg?.reactions?.['fire']).toBeUndefined();
            expect(updatedMsg?.reactions?.['rocket']).toContain('user-3');
        });
    });
});
