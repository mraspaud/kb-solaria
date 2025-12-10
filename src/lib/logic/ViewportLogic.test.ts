import { describe, it, expect } from 'vitest';
import { ViewportLogic, type Rect } from './ViewportLogic';

// Helper to create fake DOM Rects
const rect = (top: number, bottom: number, height: number): Rect => ({ top, bottom, height });

describe('ViewportLogic', () => {
    const VIEWPORT_HEIGHT = 800;
    const SCROLL_BUFFER = 150; // The "SCROLL_OFF" constant

    // Container is at screen position 0 to 800
    const containerRect = rect(0, 800, 800);

    it('does nothing if cursor is safely visible', () => {
        // Cursor is in the middle (top: 300, bottom: 350)
        const cursorRect = rect(300, 350, 50);
        const currentScroll = 1000;

        const result = ViewportLogic.getScrollToCursor(
            containerRect, 
            cursorRect, 
            currentScroll, 
            SCROLL_BUFFER
        );

        expect(result).toBeNull(); // No scroll needed
    });

    it('scrolls down if cursor is below the fold', () => {
        // Cursor bottom is at 900 (100px below viewport bottom of 800)
        // We want 150px buffer. So we need to pull up by (100 + 150) = 250px?
        // Let's check the logic: 
        // distBottom = container.bottom - element.bottom = 800 - 900 = -100.
        // if distBottom < 150 ... target += (150 - (-100)) = 250.
        
        const cursorRect = rect(850, 900, 50);
        const currentScroll = 1000;

        const result = ViewportLogic.getScrollToCursor(
            containerRect, 
            cursorRect, 
            currentScroll, 
            SCROLL_BUFFER
        );

        expect(result).toBe(1000 + (SCROLL_BUFFER - (-100))); // 1250
    });

    it('scrolls up if cursor is above the fold', () => {
        // Cursor top is at -50 (50px above viewport top)
        const cursorRect = rect(-50, 0, 50);
        const currentScroll = 1000;

        const result = ViewportLogic.getScrollToCursor(
            containerRect, 
            cursorRect, 
            currentScroll, 
            SCROLL_BUFFER
        );

        // distTop = -50 - 0 = -50.
        // target -= (150 - (-50)) = 200.
        expect(result).toBe(1000 - 200); // 800
    });

    it('handles the "Conveyor Belt" logic (Incoming Messages)', () => {
        // User is detached (reading history).
        // New message arrives. 
        // Logic: If cursor is > 150px from top, pull the belt (scroll to bottom).
        
        // Case A: Cursor is near top (Offset 50px). Don't auto-scroll.
        const cursorNearTop = rect(50, 100, 50);
        expect(ViewportLogic.shouldConveyorScroll(containerRect, cursorNearTop)).toBe(false);

        // Case B: Cursor is far down (Offset 200px). Auto-scroll.
        const cursorFarDown = rect(200, 250, 50);
        expect(ViewportLogic.shouldConveyorScroll(containerRect, cursorFarDown)).toBe(true);
    });
});
