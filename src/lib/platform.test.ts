import { describe, it, expect, beforeEach } from 'vitest';

describe('Platform Module', () => {
    it('loads without error', async () => {
        // Integration test: verify the module can be imported
        const platform = await import('./platform');
        expect(platform).toBeDefined();
    });

    it('exports copyToClipboard function', async () => {
        const { copyToClipboard } = await import('./platform');
        expect(typeof copyToClipboard).toBe('function');
    });

    it('copyToClipboard returns a Promise', async () => {
        // Stub navigator.clipboard for JSDOM environment
        Object.assign(navigator, {
            clipboard: {
                writeText: () => Promise.resolve(),
            },
        });
        
        const { copyToClipboard } = await import('./platform');
        const result = copyToClipboard('test');
        expect(result).toBeInstanceOf(Promise);
    });
});
