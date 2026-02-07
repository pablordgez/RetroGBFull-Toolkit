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
    // Zoom level
    const [scale, setScale] = useState(minScale);
    // Position
    const [pan, setPan] = useState({ x: 0, y: 0 });

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

        setScale(finalScale);
        // Calculates top left position that will center the content
        // 1. Calculates size of the content scaled
        // 2. Substracts from the viewport size to get the space that must be left on the sides
        // 3. Divides by 2 to get the space on one side
        setPan({
            x: (viewportSize.w - contentWidth * finalScale) / 2,
            y: (viewportSize.h - contentHeight * finalScale) / 2
        });
    }, [viewportSize, contentWidth, contentHeight, minScale]);

    // Automatically adjusts zoom
    useEffect(() => {
        if (autoFit && viewportSize.w > 0 && viewportSize.h > 0) {
            fitToScreen();
        }
    }, [viewportSize, fitToScreen, autoFit]);

    const handleZoom = useCallback((factor: number, centerX: number, centerY: number) => {
        // The new scale is the scale multiplied by the factor (how much we are zooming in or out), clamped to the min and max scale
        const newScale = Math.max(minScale, Math.min(maxScale, scale * factor));
        // center is the center of the zoom (mouse position)
        // We transform it into the position within the content
        // For this we substract the pan (how much the content is moved) and divide by the scale
        const worldX = (centerX - pan.x) / scale;
        const worldY = (centerY - pan.y) / scale;

        // To keep the content in the same position we need to modify the pan so that the world position stays in the same center position
        // For this we isolate the pan from the previous formula and replace the scale with the new scale
        // This will make it so that calculating the world position from the same center position with the new pan and scale
        // will result in the same world position as before
        const newPanX = centerX - worldX * newScale;
        const newPanY = centerY - worldY * newScale;

        setScale(newScale);
        setPan({ x: newPanX, y: newPanY });
    }, [scale, pan, minScale, maxScale]);

    const handlePan = useCallback((dx: number, dy: number) => {
        setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    }, []);

    const setZoom = useCallback((newScale: number) => {
        const clamped = Math.max(minScale, Math.min(maxScale, newScale));
        setScale(clamped);
    }, [minScale, maxScale]);

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
        scale,
        pan,
        setPan,
        setScale,
        containerRef,
        fitToScreen,
        handleZoom,
        handlePan,
        setZoom
    };
};
