// src/lib/utils/messageUtils.ts

/**
 * Extract all URLs from a text string.
 */
export const extractUrls = (content: string): string[] => {
    const urlRegex = /(https?:\/\/[^\s<>)]+)/g;
    return content.match(urlRegex) || [];
};
