/**
 * Timestamp utilities for converting between seconds and milliseconds.
 * Backend timestamps are in seconds, JavaScript Date uses milliseconds.
 */

/** Convert seconds to milliseconds, treating undefined/null as 0 */
export const toMs = (seconds: number | undefined | null): number =>
    (seconds || 0) * 1000;

/** Check if a message timestamp is after a threshold (in ms) */
export const isAfterMs = (timestampMs: number, thresholdMs: number): boolean =>
    timestampMs > thresholdMs;
