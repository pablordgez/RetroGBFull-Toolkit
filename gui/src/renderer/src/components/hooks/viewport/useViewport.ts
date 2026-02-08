import { useState, useCallback, useEffect, useRef } from 'react';

export const useViewport = (
    contentWidth: number, 
    contentHeight: number, 
    minScale: number = 1, 
    maxScale: number = 200,
    autoFit: boolean = true
) => {
    // Container size
    const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
    
    // State for rendering
    const [, setRenderTick] = useState(0);

    // Zoom level
    const scaleRef = useRef(minScale);
    // Position
    const panRef = useRef({ x: 0, y: 0 });

    // Helper to force update
    const forceUpdate = () => setRenderTick(t => t + 1);

    // Calculates zoom to fit and center
    const fitToScreen = useCallback(() => {
        if (viewportSize.w === 0 || viewportSize.h === 0) return;

        const padding = 40;
        const availW = viewportSize.w - padding;
        const availH = viewportSize.h - padding;
        
        // Calculates the scale (how many times the content fits in the space) and takes the smallest one (width or height) (otherwise one of them would overflow)
        const rawScale = Math.min(availW / contentWidth, availH / contentHeight);
        const newScale = rawScale >= 1 ? Math.floor(rawScale) : rawScale;
        const finalScale = Math.max(minScale, newScale);

        scaleRef.current = finalScale;
        
        // Calculates top left position that will center the content
        // 1. Calculates size of the content scaled
        // 2. Substracts from the viewport size to get the space that must be left on the sides
        // 3. Divides by 2 to get the space on one side
        panRef.current = {
            x: (viewportSize.w - contentWidth * finalScale) / 2,
            y: (viewportSize.h - contentHeight * finalScale) / 2
        };
        forceUpdate();
    }, [viewportSize, contentWidth, contentHeight, minScale]);

    // Automatically adjusts zoom
    useEffect(() => {
        if (autoFit && viewportSize.w > 0 && viewportSize.h > 0) {
            fitToScreen();
        }
    }, [viewportSize, fitToScreen, autoFit]);

    const handleZoom = useCallback((factor: number, centerX: number, centerY: number) => {
        const currentScale = scaleRef.current;
        const currentPan = panRef.current;

        // The new scale is the scale multiplied by the factor (how much we are zooming in or out), clamped to the min and max scale
        const newScale = Math.max(minScale, Math.min(maxScale, currentScale * factor));
        
        // center is the center of the zoom (mouse position)
        // We transform it into the position within the content
        // For this we substract the pan (how much the content is moved) and divide by the scale
        const worldX = (centerX - currentPan.x) / currentScale;
        const worldY = (centerY - currentPan.y) / currentScale;

        // To keep the content in the same position we need to modify the pan so that the world position stays in the same center position
        // For this we isolate the pan from the previous formula and replace the scale with the new scale
        // This will make it so that calculating the world position from the same center position with the new pan and scale
        // will result in the same world position as before
        const newPanX = centerX - worldX * newScale;
        const newPanY = centerY - worldY * newScale;

        scaleRef.current = newScale;
        panRef.current = { x: newPanX, y: newPanY };
        forceUpdate();
    }, [minScale, maxScale]);

    const handlePan = useCallback((dx: number, dy: number) => {
        panRef.current = {
            x: panRef.current.x + dx,
            y: panRef.current.y + dy
        };
        forceUpdate();
    }, []);

    const setZoom = useCallback((newScale: number) => {
        const clamped = Math.max(minScale, Math.min(maxScale, newScale));
        scaleRef.current = clamped;
        forceUpdate();
    }, [minScale, maxScale]);

    const setScale = useCallback((action: number | ((prev: number) => number)) => {
        if (typeof action === 'function') {
            scaleRef.current = action(scaleRef.current);
        } else {
            scaleRef.current = action;
        }
        forceUpdate();
    }, []);

    const setPan = useCallback((action: { x: number, y: number } | ((prev: { x: number, y: number }) => { x: number, y: number })) => {
         if (typeof action === 'function') {
            panRef.current = action(panRef.current);
        } else {
            panRef.current = action;
        }
        forceUpdate();
    }, []);

    const containerRef = useRef<HTMLDivElement>(null);

    // Executes on every render
    useEffect(() => {
        // Gets a reference to the container
        const container = containerRef.current;
        if (!container) return;
        // Creates a ResizeObserver which calls the callback function if the observed element resizes
        const observer = new ResizeObserver((entries) => {
            // Gets the first observed element (only one, the container)
            const entry = entries[0];
            if (entry) {
                // Updates the size variables
                setViewportSize({
                    w: entry.contentRect.width,
                    h: entry.contentRect.height
                });
            }
        });
        // Attaches the observer to the container
        observer.observe(container);
        // Cleanup, disconnects the observer
        return () => observer.disconnect();
    }, []);

    return {
        viewportSize,
        scale: scaleRef.current,
        pan: panRef.current,
        setPan,
        setScale,
        containerRef,
        fitToScreen,
        handleZoom,
        handlePan,
        setZoom
    };
};
