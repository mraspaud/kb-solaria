// src/lib/logic/ReadManager.ts
// Centralized read state management - handles marking messages as read

import type { ChannelIdentity, Message } from './types';

/**
 * Callbacks for the ReadManager to interact with external systems
 * This avoids circular dependencies with stores
 */
export interface ReadManagerCallbacks {
    sendToServer: (channelId: string, messageId: string, serviceId: string) => void;
    updateChannelLastRead: (channelId: string, timestamp: number) => void;
    clearUnreadCount: (channelId: string) => void;
    purgeVirtualBuffer: (bufferId: string, channelId: string, upToTimestamp: number, isThread: boolean) => void;
}

class ReadManagerImpl {
    private callbacks: ReadManagerCallbacks | null = null;
    private lastAckedMsgId: string | null = null;

    /**
     * Initialize with callbacks to interact with stores/sockets
     */
    initialize(callbacks: ReadManagerCallbacks): void {
        this.callbacks = callbacks;
    }

    /**
     * Mark messages as read up to a specific message
     * This is the single entry point for all read operations
     *
     * @param channel The channel being read
     * @param message The message to mark as read up to
     * @param skipServer If true, only update local state (for restoration)
     */
    markRead(channel: ChannelIdentity, message: Message, skipServer = false): void {
        if (!this.callbacks) {
            console.warn('ReadManager not initialized');
            return;
        }

        // Skip internal channels
        if (channel.service.id === 'internal' || channel.id === 'system') {
            return;
        }

        // Prevent duplicate server calls for same message
        if (message.id === this.lastAckedMsgId && !skipServer) {
            return;
        }

        const timestamp = message.timestamp.getTime() / 1000; // Convert to seconds
        const realChannelId = channel.isThread ? channel.parentChannel?.id : channel.id;

        if (!realChannelId) return;

        // 1. Send to server (unless skipped)
        if (!skipServer) {
            this.callbacks.sendToServer(realChannelId, message.id, channel.service.id);
            this.lastAckedMsgId = message.id;
        }

        // 2. Update local lastReadAt
        this.callbacks.updateChannelLastRead(channel.id, timestamp);

        // 3. Clear unread count
        this.callbacks.clearUnreadCount(channel.id);
    }

    /**
     * Purge read messages from triage/inbox buffers
     * Called after marking messages as read
     *
     * @param channel The channel that was read
     * @param upToTimestamp Timestamp to purge up to (in seconds)
     */
    purgeTriage(channel: ChannelIdentity, upToTimestamp: number): void {
        if (!this.callbacks) return;

        const isThread = channel.isThread || false;
        const channelId = channel.id;

        // Purge from both virtual buffers
        this.callbacks.purgeVirtualBuffer('triage', channelId, upToTimestamp, isThread);
        this.callbacks.purgeVirtualBuffer('inbox', channelId, upToTimestamp, isThread);
    }

    /**
     * Reset the last acked message ID (call on channel switch)
     */
    resetAckState(): void {
        this.lastAckedMsgId = null;
    }

    /**
     * Get the last acked message ID (for debugging)
     */
    getLastAckedMsgId(): string | null {
        return this.lastAckedMsgId;
    }
}

// Export singleton instance
export const ReadManager = new ReadManagerImpl();
