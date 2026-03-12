// Platform abstraction layer for Tauri/Browser compatibility

/**
 * Copies text to the system clipboard.
 * Uses Tauri's clipboard plugin when running in Tauri, falls back to browser API otherwise.
 */
export async function copyToClipboard(text: string): Promise<void> {
    if ('__TAURI__' in window) {
        const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
        await writeText(text);
    } else {
        await navigator.clipboard.writeText(text);
    }
}
