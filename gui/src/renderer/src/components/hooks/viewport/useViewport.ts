import { useState, useCallback, useEffect, useRef } from 'react';

export const useViewport = (
    contentWidth: number, 
    contentHeight: number, 
    minScale: number = 1, 
    maxScale: number = 200
) => {
    const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
    const [scale, setScale] = useState(minScale);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const hasInitialized = useRef(false);

    const fitToScreen = useCallback(() => {
        if (viewportSize.w === 0 || viewportSize.h === 0) return;

        const padding = 40;
        const availW = viewportSize.w - padding;
        const availH = viewportSize.h - padding;
        const newScale = Math.floor(Math.min(availW / contentWidth, availH / contentHeight));
        const finalScale = Math.max(minScale, newScale);

        setScale(finalScale);
        setPan({
            x: (viewportSize.w - contentWidth * finalScale) / 2,
            y: (viewportSize.h - contentHeight * finalScale) / 2
        });
    }, [viewportSize, contentWidth, contentHeight, minScale]);

    // Auto-fit on first valid size
    useEffect(() => {
        if (!hasInitialized.current && viewportSize.w > 0 && viewportSize.h > 0) {
            fitToScreen();
            hasInitialized.current = true;
        }
    }, [viewportSize, fitToScreen]);

    const handleZoom = useCallback((factor: number, centerX: number, centerY: number) => {
        const newScale = Math.max(minScale, Math.min(maxScale, scale * factor));
        const worldX = (centerX - pan.x) / scale;
        const worldY = (centerY - pan.y) / scale;

        const newPanX = centerX - worldX * newScale;
        const newPanY = centerY - worldY * newScale;

        setScale(newScale);
        setPan({ x: newPanX, y: newPanY });
    }, [scale, pan, minScale, maxScale]);

    const handlePan = useCallback((dx: number, dy: number) => {
        setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    }, []);

    // Helper to attach to a container div to measure its size
    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                setViewportSize({
                    w: entry.contentRect.width,
                    h: entry.contentRect.height
                });
            }
        });

        observer.observe(container);
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
        handlePan
    };
};
