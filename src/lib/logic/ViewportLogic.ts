export interface Rect {
    top: number;
    bottom: number;
    height: number;
}

export class ViewportLogic {
    
    /**
     * Calculates the new scroll position to keep the cursor in view.
     * Returns null if no scroll is needed.
     */
    static getScrollToCursor(
        container: Rect, 
        element: Rect, 
        currentScrollTop: number, 
        buffer: number = 150
    ): number | null {
        
        const distTop = element.top - container.top;
        const distBottom = container.bottom - element.bottom;

        if (distTop < buffer) {
            // Scroll Up
            return currentScrollTop - (buffer - distTop);
        } 
        else if (distBottom < buffer) {
            // Scroll Down
            return currentScrollTop + (buffer - distBottom);
        }

        return null;
    }

    /**
     * Determines if the "Conveyor Belt" should pull the viewport down.
     * Based on App.svelte logic: if cursor is significantly down the page (>150px),
     * we assume the user wants to "ride the wave" of new messages.
     */
    static shouldConveyorScroll(container: Rect, cursor: Rect, threshold: number = 150): boolean {
        const offset = cursor.top - container.top;
        return offset > threshold;
    }
}
