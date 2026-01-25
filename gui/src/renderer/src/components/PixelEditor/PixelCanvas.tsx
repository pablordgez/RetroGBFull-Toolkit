import React, { useRef, useCallback, useEffect } from 'react';
import { usePixelGridRender } from './usePixelGridRender';

interface PixelCanvasProps {
    grid: Uint8Array;
    width: number;
    height: number;
    palette: string[];
    transparentColor?: string;
    transparencyGridBackground?: string;
    backgroundColor?: string;
    gridColor?: string;
    majorGridColor?: string;
    gridSize?: { w: number, h: number };
    eraserIndex?: number;


    viewportSize: { w: number, h: number };
    scale: number;
    pan: { x: number, y: number };
    
    onPixelInput: (x: number, y: number, type: 'down' | 'move' | 'up' | 'leave', button: number) => void;
    onPan: (dx: number, dy: number) => void;
    onZoom: (factor: number, centerX: number, centerY: number) => void;
}

export const PixelCanvas: React.FC<PixelCanvasProps> = ({
    grid, width, height, palette,
    transparentColor, transparencyGridBackground, backgroundColor, gridColor, majorGridColor, gridSize, eraserIndex,
    viewportSize, scale, pan,
    onPixelInput, onPan, onZoom
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isPanning = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });

    usePixelGridRender({
        canvasRef: canvasRef as React.RefObject<HTMLCanvasElement>,
        grid, width, height,
        viewportSize, scale, pan,
        palette,
        transparentColor, transparencyGridBackground, backgroundColor, gridColor, majorGridColor, gridSize, eraserIndex
    });

    const screenToWorld = useCallback((screenX: number, screenY: number) => {
        return {
            x: Math.floor((screenX - pan.x) / scale),
            y: Math.floor((screenY - pan.y) / scale)
        };
    }, [pan, scale]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 1) {
            e.preventDefault();
            isPanning.current = true;
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            return;
        }

        const rect = canvasRef.current!.getBoundingClientRect();
        const { x, y } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        
        onPixelInput(x, y, 'down', e.button);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isPanning.current) {
            const dx = e.clientX - lastMousePos.current.x;
            const dy = e.clientY - lastMousePos.current.y;
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            onPan(dx, dy);
            return;
        }

        const rect = canvasRef.current!.getBoundingClientRect();
        const { x, y } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        

        const button = e.buttons > 0 ? (e.buttons & 1 ? 0 : (e.buttons & 2 ? 2 : 1)) : -1;
        onPixelInput(x, y, 'move', button);
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (isPanning.current) {
            isPanning.current = false;
            return;
        }
        const rect = canvasRef.current!.getBoundingClientRect();
        const { x, y } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        onPixelInput(x, y, 'up', e.button);
    };

    const handleMouseLeave = () => {
        isPanning.current = false;
        onPixelInput(-1, -1, 'leave', -1);
    }

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            onZoom(zoomFactor, mouseX, mouseY);
        };

        canvas.addEventListener('wheel', onWheel, { passive: false });
        return () => canvas.removeEventListener('wheel', onWheel);
    }, [onZoom]);

    return (
        <canvas
            ref={canvasRef}
            width={viewportSize.w}
            height={viewportSize.h}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onContextMenu={(e) => e.preventDefault()}
            style={{ 
                cursor: isPanning.current ? 'grab' : 'crosshair',
                touchAction: 'none',
                display: 'block'
            }}
        />
    );
};
