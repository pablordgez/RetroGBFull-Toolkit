import { useLayoutEffect, RefObject } from 'react';
import { GB_PALETTE } from '../SpriteEditor/SpriteEditorConfig';

export const useCanvasRender = (
    canvasRef: RefObject<HTMLCanvasElement>,
    grid: Uint8Array,
    width: number,
    height: number,
    zoom: number,
    is8x16Mode: boolean,
    palette: string[]
) => {
    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        ctx.imageSmoothingEnabled = false;

        ctx.fillStyle = GB_PALETTE[0];
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const transparentMarkerColor = 'rgba(15, 56, 15, 0.25)';
        const halfZoom = zoom / 2;

        for (let i = 0; i < grid.length; i++) {
            const x = (i % width) * zoom;
            const y = Math.floor(i / width) * zoom;

            if (grid[i] === 0) {
                
                ctx.fillStyle = transparentMarkerColor;
                
                ctx.fillRect(x, y, halfZoom, halfZoom);
                
                ctx.fillRect(x + halfZoom, y + halfZoom, halfZoom, halfZoom);

            } else {
                ctx.fillStyle = palette[grid[i]];
                ctx.fillRect(x, y, zoom, zoom);
            }
        }

        if (zoom >= 4) {
            ctx.lineWidth = 1;
            
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(15, 56, 15, 0.15)';
            for (let x = 1; x < width; x++) {
                if (x % 8 !== 0) {
                    ctx.moveTo(x * zoom, 0);
                    ctx.lineTo(x * zoom, height * zoom);
                }
            }
            for (let y = 1; y < height; y++) {
                const isMajorLine = is8x16Mode ? (y % 16 === 0) : (y % 8 === 0);
                if (!isMajorLine) {
                    ctx.moveTo(0, y * zoom);
                    ctx.lineTo(width * zoom, y * zoom);
                }
            }
            ctx.stroke();

            ctx.beginPath();
            ctx.strokeStyle = 'rgba(15, 56, 15, 0.5)';
            for (let x = 8; x < width; x += 8) {
                ctx.moveTo(x * zoom, 0);
                ctx.lineTo(x * zoom, height * zoom);
            }
            const strongLineStep = is8x16Mode ? 16 : 8;
            for (let y = strongLineStep; y < height; y += strongLineStep) {
                ctx.moveTo(0, y * zoom);
                ctx.lineTo(width * zoom, y * zoom);
            }
            ctx.stroke();
        }
    }, [grid, width, height, zoom, is8x16Mode, palette]);
};