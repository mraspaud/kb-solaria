// src/lib/test/TestHarness.ts
// Wrapper around chatStore for convenient testing

import { get } from 'svelte/store';
import { chatStore } from '../stores/chat';
import type { ChannelIdentity, Message, UserIdentity, ChatState, ServiceIdentity } from '../logic/types';
import { fixtures, createUser } from './fixtures';
import { dumpState, serializeVirtualState } from './TextRepresentation';

export interface BootstrapOptions {
    identity?: UserIdentity;
    service?: ServiceIdentity;
    channels?: ChannelIdentity[];
    participatedThreads?: string[];
}

/**
 * TestHarness wraps the chatStore and provides a convenient API for tests.
 *
 * Usage:
 *   const harness = new TestHarness();
 *   harness.bootstrap({ channels: [myChannel] });
 *   harness.dispatchMessage(myChannel, myMessage);
 *   expect(harness.virtualCounts.inbox).toBe(1);
 */
export class TestHarness {
    /** Default test service */
    readonly testService: ServiceIdentity = { id: 'test-slack', name: 'TestSlack' };

    /** Default test user (will be set as identity) */
    readonly testUser: UserIdentity = { id: 'me', name: 'TestUser', serviceId: 'test-slack' };

    constructor() {
        // Start fresh
        this.reset();
    }

    // --- INITIALIZATION ---

    /**
     * Reset all state to clean slate
     */
    reset(): void {
        chatStore.reset();
    }

    /**
     * Bootstrap with standard test environment
     */
    bootstrap(options: BootstrapOptions = {}): void {
        this.reset();

        const service = options.service || this.testService;
        const identity = options.identity || this.testUser;

        // Set identity for the service
        chatStore.setIdentity(service.id, identity);

        // Set up channels
        if (options.channels) {
            chatStore.upsertChannels(options.channels);
        }

        // Set up participated threads
        if (options.participatedThreads) {
            chatStore.hydrateParticipatedThreads(options.participatedThreads);
        }
    }

    // --- USER ACTIONS ---

    /**
     * Switch to a channel (with optional cursor hint)
     */
    switchChannel(
        channel: ChannelIdentity,
        cursorHint?: 'unread' | 'bottom' | { jumpTo: string }
    ): void {
        chatStore.switchChannel(channel, cursorHint);
    }

    /**
     * Move cursor by delta
     */
    moveCursor(delta: number): void {
        chatStore.moveCursor(delta);
    }

    /**
     * Jump to specific index
     */
    jumpTo(index: number): void {
        chatStore.jumpTo(index);
    }

    /**
     * Jump to bottom of current buffer
     */
    jumpToBottom(): void {
        chatStore.jumpToBottom();
    }

    /**
     * Open thread from a message
     */
    openThread(msg: Message): void {
        chatStore.openThread(msg);
    }

    /**
     * Go back in navigation history
     */
    goBack(): void {
        chatStore.goBack();
    }

    /**
     * Mark read up to a message
     */
    markReadUpTo(channel: ChannelIdentity, message: Message | null): void {
        chatStore.markReadUpTo(channel, message);
    }

    /**
     * Dispatch a message (simulates receiving from server)
     */
    dispatchMessage(channel: ChannelIdentity, msg: Message): void {
        chatStore.dispatchMessage(channel, msg);
    }

    /**
     * Detach from auto-scroll
     */
    detach(): void {
        chatStore.detach();
    }

    /**
     * Handle reaction add/remove
     */
    handleReaction(
        channelId: string,
        msgId: string,
        emoji: string,
        userId: string,
        action: 'add' | 'remove'
    ): void {
        chatStore.handleReaction(channelId, msgId, emoji, userId, action);
    }

    // --- STATE ACCESSORS ---

    /**
     * Get current state snapshot
     */
    get state(): ChatState {
        return get(chatStore);
    }

    /**
     * Get messages in current view
     */
    get messages(): Message[] {
        return this.state.messages;
    }

    /**
     * Get current channel
     */
    get activeChannel(): ChannelIdentity {
        return this.state.activeChannel;
    }

    /**
     * Get cursor position
     */
    get cursorIndex(): number {
        return this.state.cursorIndex;
    }

    /**
     * Get message at cursor
     */
    get cursorMessage(): Message | undefined {
        return this.state.messages[this.state.cursorIndex];
    }

    /**
     * Get virtual counts (triage/inbox)
     */
    get virtualCounts(): { triage: number; inbox: number } {
        return this.state.virtualCounts;
    }

    /**
     * Get unread marker index
     */
    get unreadMarkerIndex(): number {
        return this.state.unreadMarkerIndex;
    }

    /**
     * Check if attached (auto-scroll mode)
     */
    get isAttached(): boolean {
        return this.state.isAttached;
    }

    /**
     * Get buffer IDs for a channel
     */
    getBufferIds(channelId: string): string[] {
        return this.state.buffers.get(channelId) || [];
    }

    /**
     * Get a message from the entities database
     */
    getMessage(id: string): Message | undefined {
        return this.state.entities.messages.get(id);
    }

    // --- DEBUGGING ---

    /**
     * Dump full state (for debugging failed tests)
     */
    dump(): string {
        return dumpState(this.state);
    }

    /**
     * Dump virtual state (triage/inbox contents)
     */
    dumpVirtual(): string {
        return serializeVirtualState(this.state);
    }

    /**
     * Log state to console (useful during test development)
     */
    log(label?: string): void {
        if (label) {
            console.log(`\n=== ${label} ===`);
        }
        console.log(this.dump());
    }

    // --- ASSERTIONS (throw on failure) ---

    /**
     * Assert current channel
     */
    assertActiveChannel(channelId: string): void {
        const actual = this.activeChannel.id;
        if (actual !== channelId) {
            throw new Error(
                `Expected active channel "${channelId}", got "${actual}"\n${this.dump()}`
            );
        }
    }

    /**
     * Assert message count in current view
     */
    assertMessageCount(expected: number): void {
        const actual = this.messages.length;
        if (actual !== expected) {
            throw new Error(
                `Expected ${expected} messages, got ${actual}\n${this.dump()}`
            );
        }
    }

    /**
     * Assert virtual counts
     */
    assertVirtualCounts(triage: number, inbox: number): void {
        const actual = this.virtualCounts;
        if (actual.triage !== triage || actual.inbox !== inbox) {
            throw new Error(
                `Expected triage=${triage}, inbox=${inbox}, ` +
                `got triage=${actual.triage}, inbox=${actual.inbox}\n${this.dumpVirtual()}`
            );
        }
    }

    /**
     * Assert cursor position
     */
    assertCursor(index: number): void {
        const actual = this.cursorIndex;
        if (actual !== index) {
            throw new Error(
                `Expected cursor at ${index}, got ${actual}\n${this.dump()}`
            );
        }
    }

    /**
     * Assert buffer contains message ID
     */
    assertBufferContains(channelId: string, messageId: string): void {
        const ids = this.getBufferIds(channelId);
        if (!ids.includes(messageId)) {
            throw new Error(
                `Expected buffer "${channelId}" to contain "${messageId}", ` +
                `but got: [${ids.join(', ')}]`
            );
        }
    }

    /**
     * Assert buffer does NOT contain message ID
     */
    assertBufferNotContains(channelId: string, messageId: string): void {
        const ids = this.getBufferIds(channelId);
        if (ids.includes(messageId)) {
            throw new Error(
                `Expected buffer "${channelId}" to NOT contain "${messageId}", ` +
                `but it does: [${ids.join(', ')}]`
            );
        }
    }
}

/**
 * Create a fresh harness for a test
 */
export function createHarness(): TestHarness {
    return new TestHarness();
}
