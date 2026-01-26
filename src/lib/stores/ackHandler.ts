// src/lib/stores/ackHandler.ts
// Message acknowledgment handling (pending -> sent status)

import type { Message } from '../logic/types';

export interface AckResult {
    /** Whether the ack was processed */
    processed: boolean;
    /** Whether buffer IDs need to be swapped (tempId -> realId) */
    needsBufferSwap: boolean;
}

/**
 * Apply acknowledgment to message database.
 * Handles two scenarios:
 * - Path A (Identity Match): ID is already correct, just confirm status
 * - Path B (Identity Swap): ID changed, re-key the message
 *
 * @param messages - The messages map to update (mutated in place)
 * @param tempId - The temporary/client ID
 * @param realId - The real/server ID
 * @param serverContent - Optional updated content from server
 * @returns Result indicating what action was taken
 */
export function applyAck(
    messages: Map<string, Message>,
    tempId: string,
    realId: string,
    serverContent?: string
): AckResult {
    // PATH A: Identity Match (Rocket.Chat)
    // The ID is already correct. We just need to confirm it.
    if (tempId === realId) {
        const msg = messages.get(tempId);
        if (msg) {
            // Mutate in place to avoid flickering (same object reference)
            msg.status = 'sent';
            if (serverContent) msg.content = serverContent;
        }
        return { processed: true, needsBufferSwap: false };
    }

    // PATH B: Identity Swap (Slack/Mattermost)
    // The ID changed. We must re-key the record while keeping the same object.
    const pendingMsg = messages.get(tempId);
    if (!pendingMsg) {
        return { processed: false, needsBufferSwap: false };
    }

    const existingReal = messages.get(realId);
    if (existingReal) {
        // Merge: The Real message arrived via WS before this Ack.
        // Update the existing real message in place and remove the temp.
        existingReal.status = 'sent';
        existingReal.clientId = tempId;
        messages.delete(tempId);
    } else {
        // Swap: Mutate the pending message in place and re-key it.
        // This preserves the object reference to avoid UI flickering.
        pendingMsg.id = realId;
        pendingMsg.clientId = tempId;
        pendingMsg.status = 'sent';
        if (serverContent) pendingMsg.content = serverContent;

        // Re-key: remove old key, add same object at new key
        messages.delete(tempId);
        messages.set(realId, pendingMsg);
    }

    return { processed: true, needsBufferSwap: true };
}

/**
 * Swap message ID in a buffer's message ID array.
 * Handles duplicates (if both temp and real exist).
 *
 * @param messageIds - The array of message IDs (mutated in place)
 * @param tempId - The temporary ID to replace
 * @param realId - The real ID to use
 */
export function swapBufferIds(
    messageIds: string[],
    tempId: string,
    realId: string
): void {
    const tempIdx = messageIds.indexOf(tempId);
    const realIdx = messageIds.indexOf(realId);

    if (tempIdx !== -1) {
        if (realIdx !== -1) {
            // Duplicate detected (Both exist): Remove Temp, keep Real
            messageIds.splice(tempIdx, 1);
        } else {
            // Normal Swap: Only Temp exists
            messageIds[tempIdx] = realId;
        }
    }
}
