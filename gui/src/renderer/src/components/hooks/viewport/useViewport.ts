import { useState, useCallback, useEffect, useRef } from 'react';

export const useViewport = (
    contentWidth: number, 
    contentHeight: number, 
    minScale: number = 1, 
    maxScale: number = 200,
    autoFit: boolean = true
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
        const rawScale = Math.min(availW / contentWidth, availH / contentHeight);
        const newScale = rawScale >= 1 ? Math.floor(rawScale) : rawScale;
        const finalScale = Math.max(minScale, newScale);

        setScale(finalScale);
        setPan({
            x: (viewportSize.w - contentWidth * finalScale) / 2,
            y: (viewportSize.h - contentHeight * finalScale) / 2
        });
    }, [viewportSize, contentWidth, contentHeight, minScale]);

    useEffect(() => {
        if (autoFit && !hasInitialized.current && viewportSize.w > 0 && viewportSize.h > 0) {
            fitToScreen();
            hasInitialized.current = true;
        }
    }, [viewportSize, fitToScreen, autoFit]);

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

    const setZoom = useCallback((newScale: number) => {
        const clamped = Math.max(minScale, Math.min(maxScale, newScale));
        setScale(clamped);
    }, [minScale, maxScale]);

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
        handlePan,
        setZoom
    };
};
