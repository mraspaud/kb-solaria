// src/lib/stores/chat.ts
import { writable, get } from 'svelte/store';
import { Workspace } from '../logic/Workspace';
import { BucketAnalyzer } from '../logic/BucketAnalyzer';
import { ChatWindow } from '../logic/ChatWindow';
import { type ChannelIdentity, type Message, type UnreadState, type UserIdentity, Bucket, type ChatState } from '../logic/types';
import {
    type CursorHint,
    positionCursor as applyCursorPosition
} from './cursorPositioning';
import { applyReaction } from './reactionHandler';
import {
    buildUpdatedUnread,
    mergeUnreadState,
    clearUnread
} from './unreadManager';
import { applyAck, swapBufferIds } from './ackHandler';

// Re-export CursorHint for external use
export { type CursorHint } from './cursorPositioning';

function createChatStore() {
    const workspace = new Workspace();

    const triageChannel: ChannelIdentity = {
        id: 'triage',
        name: 'triage',
        service: { id: 'aggregation', name: 'Solaria' }
    };
    const inboxChannel: ChannelIdentity = {
        id: 'inbox',
        name: 'inbox',
        service: { id: 'aggregation', name: 'Solaria' }
    };
    const systemChannel: ChannelIdentity = {
        id: 'system',
        name: 'system',
        service: { id: 'internal', name: 'Solaria' }
    };

    const store = writable<ChatState>({
        entities: {
            messages: new Map(),
            channels: new Map(),
            users: new Map()
        },
        buffers: new Map(),
        activeChannel: triageChannel,
        availableChannels: [triageChannel, inboxChannel, systemChannel],
        messages: [], // Hydrated view of current buffer (derived from entities)

        cursorIndex: -1,
        isAttached: true,
        unreadMarkerIndex: -1,
        unread: {},
        identities: {},
        currentUser: null,
        users: new Map(),
        participatedThreads: new Set(),
        virtualCounts: {triage: 0, inbox: 0}
    });

    workspace.openChannel(triageChannel);
    workspace.openChannel(inboxChannel);
    workspace.openChannel(systemChannel);
    workspace.activeChannel = triageChannel;

    let activeBufferUnsubscribe: (() => void) | null = null;
    let pendingHintDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    // --- SYNCHRONIZATION (The Glue) ---
    const syncState = () => {
        const win = workspace.getActiveWindow();
        const buf = workspace.getActiveBuffer();

        if (!workspace.activeChannel) return;

        // Check for pending cursor hint (set when switching to channel with empty buffer)
        // We debounce this to wait for messages to stop arriving before positioning
        if (win.pendingCursorHint && buf.messageIds.length > 0) {
            // Clear any existing debounce timer
            if (pendingHintDebounceTimer) {
                clearTimeout(pendingHintDebounceTimer);
            }

            // Debounce: wait 300ms after last message arrives before applying hint
            // This ensures we have all/most messages before positioning cursor
            pendingHintDebounceTimer = setTimeout(() => {
                pendingHintDebounceTimer = null;

                // Re-check that we still need to apply (might have been cleared)
                const currentWin = workspace.getActiveWindow();
                const currentBuf = workspace.getActiveBuffer();
                if (!currentWin.pendingCursorHint || currentBuf.messageIds.length === 0) {
                    return;
                }

                const pendingHint = currentWin.pendingCursorHint;
                const state = get(store);
                const channelToUse = mergeWithFreshChannel(workspace.activeChannel, state);
                positionCursor(channelToUse, pendingHint, state);

                // Sync state after positioning
                syncState();
            }, 300);
        }

        store.update(s => {
            const currentIds = buf.messageIds;
            const hydratedMessages = currentIds
                .map(id => s.entities.messages.get(id))
                .filter((m): m is Message => !!m)
                .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

            const newBuffers = new Map(s.buffers);
            newBuffers.set(workspace.activeChannel.id, currentIds);

            return {
                ...s,
                activeChannel: workspace.activeChannel,
                messages: hydratedMessages,
                cursorIndex: win.cursorIndex,
                isAttached: win.isAttached,
                unreadMarkerIndex: win.unreadMarkerIndex,
                buffers: newBuffers
            };
        });
    };

    /** Helper to update store and sync state in one call */
    const updateAndSync = (updateFn: (s: ChatState) => ChatState) => {
        store.update(updateFn);
        syncState();
    };

    workspace.subscribe(() => {
        setupActiveBufferListener();
        syncState();
    });

    function setupActiveBufferListener() {
        if (activeBufferUnsubscribe) activeBufferUnsubscribe();
        activeBufferUnsubscribe = workspace.getActiveBuffer().subscribe(() => {
            syncState();
        });
    }

    setupActiveBufferListener();

    // --- HELPER FUNCTIONS ---

    const clearPendingHint = (win: ChatWindow) => {
        win.pendingCursorHint = null;
        if (pendingHintDebounceTimer) {
            clearTimeout(pendingHintDebounceTimer);
            pendingHintDebounceTimer = null;
        }
    };

    const mergeWithFreshChannel = (channel: ChannelIdentity, state: ChatState): ChannelIdentity => {
        const fresh = state.availableChannels.find(c => c.id === channel.id);
        return fresh ? { ...channel, ...fresh } : channel;
    };

    /**
     * Check if incoming message is an echo of a pending message we sent.
     */
    const isDuplicateEcho = (msg: Message, state: ChatState, channel: ChannelIdentity): boolean => {
        const myIdentity = state.identities[channel.service.id];
        if (!myIdentity || msg.author.id !== myIdentity.id) return false;

        for (const [existingId, existingMsg] of state.entities.messages) {
            if (existingMsg.status === 'pending' &&
                existingMsg.content === msg.content &&
                existingId !== msg.id) {
                chatStore.handleAck(existingId, msg.id, msg.content);
                return true;
            }
        }
        return false;
    };

    /**
     * Route message to appropriate buffers based on classification.
     */
    const routeMessageToBuffers = (msgId: string, verdict: Bucket, channel: ChannelIdentity) => {
        workspace.dispatchMessageId(channel, msgId);

        if (verdict === Bucket.EGO || verdict === Bucket.CONTEXT) {
            workspace.dispatchMessageId(triageChannel, msgId);
        } else if (verdict === Bucket.SIGNAL) {
            workspace.dispatchMessageId(inboxChannel, msgId);
        }
    };

    /**
     * Build updated channels list with lastPostAt timestamp.
     */
    const buildUpdatedChannels = (
        channels: ChannelIdentity[],
        channel: ChannelIdentity,
        timestamp: number
    ): ChannelIdentity[] => {
        let channelExists = false;
        const updated = channels.map(c => {
            if (c.id === channel.id) {
                channelExists = true;
                return { ...c, lastPostAt: timestamp };
            }
            return c;
        });
        if (!channelExists) {
            updated.push({ ...channel, lastPostAt: timestamp });
        }
        return updated;
    };

    // --- CURSOR POSITIONING ---

    /**
     * Position cursor based on hint. Wraps the extracted cursorPositioning module
     * and handles the store update for unread count sync.
     */
    const positionCursor = (channel: ChannelIdentity, cursorHint: CursorHint | undefined, state: ChatState): void => {
        const win = workspace.getActiveWindow();
        const buf = workspace.getActiveBuffer();

        if (!win || !buf) return;

        const result = applyCursorPosition(
            win,
            buf,
            channel,
            cursorHint,
            state.entities.messages,
            state.unread[channel.id]
        );

        // If unread hint was applied and recalculated the count, sync with store
        if (result.actualUnreadCount !== undefined) {
            store.update(s => {
                const current = s.unread[channel.id];
                if (current && current.count !== result.actualUnreadCount) {
                    return {
                        ...s,
                        unread: { ...s.unread, [channel.id]: { ...current, count: result.actualUnreadCount } }
                    };
                }
                return s;
            });
        }
    };

    const updateVirtualCounts = (s: ChatState) => {
        const triageBuf = workspace.getBuffer('triage');
        const inboxBuf = workspace.getBuffer('inbox');
        return {
            ...s,
            virtualCounts: {
                triage: triageBuf ? triageBuf.messageIds.length : 0,
                inbox: inboxBuf ? inboxBuf.messageIds.length : 0
            }
        };
    };

    return {
        subscribe: store.subscribe,

        // For tests

        reset: () => {
            // 1. Reset Workspace (Buffers/Windows)
            workspace.reset();

            // 2. Reset Store (DB/Metadata)
            store.set({
                entities: { messages: new Map(), channels: new Map(), users: new Map() },
                buffers: new Map(),
                activeChannel: triageChannel,
                availableChannels: [triageChannel, inboxChannel, systemChannel],
                messages: [],
                cursorIndex: -1,
                isAttached: true,
                unreadMarkerIndex: -1,
                unread: {},
                identities: {},
                currentUser: null,
                users: new Map(),
                participatedThreads: new Set(),
                virtualCounts: {triage: 0, inbox: 0}
            });

            // 3. Re-open defaults
            workspace.openChannel(triageChannel);
            workspace.openChannel(inboxChannel);
            workspace.openChannel(systemChannel);
        },
        dispatchMessage: (channel: ChannelIdentity, msg: Message) => {
            // Normalize context
            if (!msg.sourceChannel) msg.sourceChannel = channel;

            // Check for duplicate echo (pending message we sent)
            const currentState = get(store);
            if (isDuplicateEcho(msg, currentState, channel)) return;

            // Store in database
            store.update(s => {
                s.entities.messages.set(msg.id, msg);
                return s;
            });

            // Track participated threads
            const myIdentity = currentState.identities[channel.service.id];
            const isMe = myIdentity && msg.author.id === myIdentity.id;
            if (isMe && msg.threadId) {
                store.update(s => {
                    s.participatedThreads.add(msg.threadId!);
                    return s;
                });
            }

            // Classify and route
            const verdict = BucketAnalyzer.classify(msg, channel, myIdentity, currentState.participatedThreads);
            msg.bucket = verdict;
            routeMessageToBuffers(msg.id, verdict, channel);

            // Update metadata and unread counts
            store.update(s => {
                const timestamp = msg.timestamp.getTime() / 1000;
                return updateVirtualCounts({
                    ...s,
                    availableChannels: buildUpdatedChannels(s.availableChannels, channel, timestamp),
                    unread: buildUpdatedUnread(s.unread, s.activeChannel.id, channel, isMe, verdict)
                });
            });
        },

        handleReaction: (channelId: string, msgId: string, emoji: string, userId: string, action: 'add' | 'remove') => {
            store.update(s => {
                const result = applyReaction(s, msgId, emoji, userId, action);
                if (!result) return s;
                return {
                    ...s,
                    entities: { ...s.entities, messages: result.updatedMessages }
                };
            });
            syncState();
        },

        moveCursor: (delta: number) => {
            const win = workspace.getActiveWindow();
            if (win.pendingCursorHint) clearPendingHint(win);
            win.moveCursor(delta);
            syncState();
        },

        jumpTo: (index: number) => {
            const win = workspace.getActiveWindow();
            if (win.pendingCursorHint) clearPendingHint(win);
            const max = workspace.getActiveBuffer().messageIds.length - 1;
            win.cursorIndex = Math.max(0, Math.min(index, max));
            win.isAttached = (win.cursorIndex >= max);
            syncState();
        },

        jumpToBottom: () => {
            workspace.getActiveWindow().jumpToBottom();
            syncState();
        },

        switchChannel: (channel: ChannelIdentity, cursorHint?: CursorHint) => {
            if (!channel) return;

            const state = get(store);
            const channelToOpen = mergeWithFreshChannel(channel, state);

            // Push current channel to history if different
            store.update(s => {
                const serviceIdentity = s.identities[channel.service.id] || null;
                if (s.activeChannel.id !== channel.id) {
                    workspace.pushToHistory(s.activeChannel);
                }
                return { ...s, currentUser: serviceIdentity };
            });

            // Open the channel (creates/gets window)
            workspace.openChannel(channelToOpen);

            // Position cursor based on hint
            const updatedState = get(store);
            positionCursor(channelToOpen, cursorHint, updatedState);

            // NOTE: We do NOT clear unread count here anymore.
            // For services with per-message granularity (Slack): cleared via markReadUpTo as cursor moves
            // For services without (Mattermost): caller (ChannelSwitcher) handles it after sendMarkRead

            syncState();
        },

        openThread: (msg: Message) => {
            const currentChan = workspace.activeChannel;
            const contextChannel = (currentChan.service.id === 'aggregation' && msg.sourceChannel)
                ? msg.sourceChannel
                : currentChan;

            // Use threadId if this is a reply, otherwise use message id (for root messages)
            // This ensures the thread channel ID matches the threadId field on all messages
            const threadRootId = msg.threadId || msg.id;
            workspace.openThread(threadRootId, contextChannel, msg);
            syncState();
        },

        goBack: () => {
            const prev = workspace.popFromHistory();
            if (prev) {
                const state = get(store);
                const channelToOpen = mergeWithFreshChannel(prev, state);

                store.update(s => {
                    const serviceIdentity = s.identities[channelToOpen.service.id] || null;
                    return { ...s, currentUser: serviceIdentity };
                });

                workspace.openChannel(channelToOpen);
                syncState();
            }
        },

        detach: () => {
            workspace.getActiveWindow().detach();
            syncState();
        },

        updateMessage: (id: string, newContent: string) => {
            store.update(s => {
                const msg = s.entities.messages.get(id);
                if (msg) {
                    msg.content = newContent;
                }
                return s;
            });
            syncState();
        },

        removeMessage: (id: string) => {
            // Keep in DB for potential undo, just remove from view
            workspace.getActiveBuffer().removeMessageId(id);

            // Cursor adjustment logic
            const win = workspace.getActiveWindow();
            const buf = workspace.getActiveBuffer();
            const max = buf.messageIds.length - 1;
            
            if (win.cursorIndex > max) win.cursorIndex = max;
            if (max < 0) win.cursorIndex = -1;
            
            win.isAttached = (win.cursorIndex === max);
            syncState();
        },

        // Helper accessors
        getLastMessageId: (channel: ChannelIdentity) => workspace.getLastMessageId(channel),
        
        // Metadata setters (upsertChannels, upsertUsers, setIdentity, etc.) 
        // remain fundamentally the same as they operate on the separate 
        // `users` and `channels` maps/arrays, which we haven't strictly normalized yet.
        upsertChannels: (newChannels: ChannelIdentity[]) => {
            store.update(s => {
                const currentChannels = s.availableChannels || [];
                const channelMap = new Map(currentChannels.map(c => [c.id, c]));
                for (const ch of newChannels) {
                    const existing = channelMap.get(ch.id);
                    channelMap.set(ch.id, existing ? { ...existing, ...ch } : ch);
                }
                return { ...s, availableChannels: Array.from(channelMap.values()) };
            });
        },

        handleAck: (tempId: string, realId: string, serverContent?: string) => {
            let needsBufferSwap = false;

            store.update(s => {
                const result = applyAck(s.entities.messages, tempId, realId, serverContent);
                needsBufferSwap = result.needsBufferSwap;
                return s;
            });

            // If IDs matched (Path A), buffers are already correct
            if (!needsBufferSwap) {
                syncState();
                return;
            }

            // Path B: Fix buffer references
            const state = get(store);
            for (const chan of state.availableChannels) {
                const buf = workspace.getBuffer(chan.id);
                if (buf) swapBufferIds(buf.messageIds, tempId, realId);
            }
            ['triage', 'inbox'].forEach(vid => {
                const buf = workspace.getBuffer(vid);
                if (buf) swapBufferIds(buf.messageIds, tempId, realId);
            });

            syncState();
        },

        upsertUsers: (newUsers: UserIdentity[]) => {
            store.update(s => {
                const updated = new Map(s.users);
                newUsers.forEach(u => updated.set(u.id, u));
                if (s.currentUser && !updated.has(s.currentUser.id)) {
                    updated.set(s.currentUser.id, s.currentUser);
                }
                return { ...s, users: updated };
            });
        },

        setIdentity: (serviceId: string, user: UserIdentity) => {
            store.update(s => {
                const userWithService = { ...user, serviceId };
                const newIdentities = { ...s.identities, [serviceId]: userWithService };
                let newCurrent = s.currentUser;
                if (s.activeChannel.service.id === serviceId) {
                    newCurrent = userWithService;
                }
                const newUsers = new Map(s.users);
                newUsers.set(user.id, userWithService);
                return { 
                    ...s, 
                    identities: newIdentities,
                    currentUser: newCurrent,
                    users: newUsers
                };
            });
        },
        
        hydrateParticipatedThreads: (threadIds: string[]) => {
             store.update(s => {
                const newThreads = new Set(s.participatedThreads);
                threadIds.forEach(id => newThreads.add(id));
                return { ...s, participatedThreads: newThreads };
            });
        },

        updateUnreadState: (channelId: string, count: number, hasMention: boolean) => {
            store.update(s => ({
                ...s,
                unread: mergeUnreadState(s.unread, channelId, count, hasMention)
            }));
        },

        markReadUpTo: (channel: ChannelIdentity, message: Message | null) => {
            store.update(s => {
                let updatedChannels = s.availableChannels;
                if (message) {
                    const msgTime = message.timestamp.getTime() / 1000;
                    updatedChannels = s.availableChannels.map(c => {
                        if (c.id === channel.id) {
                            const current = c.lastReadAt || 0;
                            return { ...c, lastReadAt: Math.max(current, msgTime) };
                        }
                        return c;
                    });
                }

                // NOTE: We no longer clear unread count here.
                // For granular services: count is synced in positionCursor and cleared when at bottom
                // For non-granular services: count is cleared by ChannelSwitcher on entry

                // PURGE Triage/Inbox
                // We must lookup the messages to check timestamps
                const filterIdList = (bufferId: string) => {
                    const buf = workspace.getBuffer(bufferId);
                    if (!buf) return;

                    const newIds = buf.messageIds.filter(id => {
                        const m = s.entities.messages.get(id);
                        if (!m) return false; // Purge ghost IDs

                        const msgChannelId = m.sourceChannel?.id || channel.id;

                        // --- DUAL READ LOGIC ---

                        // 1. If we are reading a specific THREAD
                        if (channel.isThread) {
                            // Extract root ID from thread channel (format: "thread_<rootId>")
                            const threadRootId = channel.id.replace('thread_', '');

                            // Message belongs to this thread if:
                            // - It's the root message (m.id === threadRootId)
                            // - It's a reply in this thread (m.threadId === threadRootId)
                            const isInThisThread = m.id === threadRootId || m.threadId === threadRootId;

                            return !isInThisThread ||
                                (message && m.timestamp.getTime() > message.timestamp.getTime());
                        }

                        // 2. If we are reading a CHANNEL
                        else {
                            // Only purge messages belonging to THIS channel (roots)
                            if (msgChannelId !== channel.id) return true;

                            // CRITICAL: Do NOT purge thread replies that appear in Triage/Inbox
                            // when reading the main channel. They have their own lifecycle.
                            if (m.threadId) return true;

                            if (message) return m.timestamp.getTime() > message.timestamp.getTime();
                            return false;
                        }
                    });

                    if (buf.messageIds.length !== newIds.length) {
                        buf.setMessageIds(newIds);  // Use method to trigger notify()
                    }
                };

                filterIdList('triage');
                filterIdList('inbox');

                // Sync the filtered buffer IDs to the store's buffers Map
                // (virtualCounts reads from workspace, but UI may read from state.buffers)
                const inboxBuf = workspace.getBuffer('inbox');
                const triageBuf = workspace.getBuffer('triage');
                const newBuffers = new Map(s.buffers);
                if (inboxBuf) newBuffers.set('inbox', [...inboxBuf.messageIds]);
                if (triageBuf) newBuffers.set('triage', [...triageBuf.messageIds]);

                // Force sync to update virtual counts
                const nextState = { ...s, availableChannels: updatedChannels, buffers: newBuffers };
                return updateVirtualCounts(nextState);
            });

            // Explicitly sync to refresh UI if we are looking at Triage/Inbox
            syncState();
        },

        isMyMessage: (msg: Message) => {
            const state = get(store);
            if (!state.currentUser) return false;
            return msg.author.id === state.currentUser.id;
        },

        isChannelReadOnly: (channelId: string): boolean =>
            channelId === 'system' || channelId === 'triage' || channelId === 'inbox',

        /**
         * Update unread marker high water mark (when cursor moves forward)
         */
        updateUnreadMarkerHighWater: (cursorIndex: number) => {
            const win = workspace.getActiveWindow();
            win.updateUnreadMarkerHighWater(cursorIndex);
            syncState();
        },

        /**
         * Clear the unread marker (when reaching bottom)
         */
        clearUnreadMarker: () => {
            const win = workspace.getActiveWindow();
            win.clearUnreadMarker();
            syncState();
        },

        /**
         * Recalculate unread marker for current channel
         */
        recalculateUnreadMarker: () => {
            const state = get(store);
            const win = workspace.getActiveWindow();
            const channel = mergeWithFreshChannel(workspace.activeChannel, state);
            win.updateUnreadMarker(channel.lastReadAt, state.entities.messages);
            syncState();
        },

        /**
         * Clear unread count for a channel (used by ChannelSwitcher for non-granular services)
         * This only clears the count in the sidebar/switcher, NOT the visual marker
         */
        clearUnreadCount: (channelId: string) => {
            store.update(s => ({ ...s, unread: clearUnread(s.unread, channelId) }));
        }
    };
}

export const chatStore = createChatStore();
