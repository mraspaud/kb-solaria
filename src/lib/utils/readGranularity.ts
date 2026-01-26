/**
 * Service-specific read tracking behavior.
 *
 * - Slack: Per-message granularity - messages before cursor are read
 * - Mattermost/others: Channel-level - entire channel is marked read
 */

const SERVICES_WITH_MESSAGE_GRANULARITY = new Set(['slack']);

/**
 * Returns true if the service tracks read status per-message.
 * For these services, the unread count clears as cursor moves.
 */
export const hasMessageGranularity = (serviceId: string): boolean =>
    SERVICES_WITH_MESSAGE_GRANULARITY.has(serviceId);
