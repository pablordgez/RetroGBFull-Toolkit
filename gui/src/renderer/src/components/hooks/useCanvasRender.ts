import { useLayoutEffect, RefObject } from 'react';
import { GB_PALETTE, ERASER_COLOR } from '../SpriteEditor/SpriteEditorConfig';

const drawLine = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) => {
    ctx.moveTo(x1 + 0.5, y1 + 0.5);
    ctx.lineTo(x2 + 0.5, y2 + 0.5);
};

export const useCanvasRender = (
    canvasRef: RefObject<HTMLCanvasElement>,
    grid: Uint8Array,
    spriteW: number,
    spriteH: number,
    viewportW: number,
    viewportH: number,
    scale: number,
    pan: { x: number, y: number },
    is8x16Mode: boolean,
    palette: string[]
) => {
    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        ctx.fillStyle = '#202020';
        ctx.fillRect(0, 0, viewportW, viewportH);

        const startX = Math.floor(pan.x);
        const startY = Math.floor(pan.y);
        const renderW = Math.floor(spriteW * scale);
        const renderH = Math.floor(spriteH * scale);

        ctx.fillStyle = GB_PALETTE[0];
        ctx.fillRect(startX, startY, renderW, renderH);

        const colStart = Math.max(0, Math.floor(-pan.x / scale));
        const colEnd = Math.min(spriteW, Math.ceil((viewportW - pan.x) / scale));
        const rowStart = Math.max(0, Math.floor(-pan.y / scale));
        const rowEnd = Math.min(spriteH, Math.ceil((viewportH - pan.y) / scale));

        const transparentColor = 'rgba(15, 56, 15, 0.25)';
        const halfScale = scale / 2;

        for (let y = rowStart; y < rowEnd; y++) {
            for (let x = colStart; x < colEnd; x++) {
                const i = y * spriteW + x;
                const colorIndex = grid[i];

                const drawX = Math.floor(pan.x + x * scale);
                const drawY = Math.floor(pan.y + y * scale);
                const drawSize = Math.ceil(scale);

                if (colorIndex === ERASER_COLOR || colorIndex === 0) {
                    ctx.fillStyle = transparentColor;
                    ctx.fillRect(drawX, drawY, halfScale, halfScale);
                    ctx.fillRect(drawX + halfScale, drawY + halfScale, halfScale, halfScale);
                } else {
                    ctx.fillStyle = palette[colorIndex];
                    ctx.fillRect(drawX, drawY, drawSize, drawSize);
                }
            }
        }

        if (scale >= 4) {
            ctx.lineWidth = 1;

            ctx.beginPath();
            ctx.strokeStyle = 'rgba(15, 56, 15, 0.15)';

            for (let x = colStart; x <= colEnd; x++) {
                if (x % 8 !== 0) {
                    const vx = Math.floor(pan.x + x * scale);
                    const top = Math.max(0, startY);
                    const bottom = Math.min(viewportH, startY + renderH);
                    if (vx >= 0 && vx <= viewportW) drawLine(ctx, vx, top, vx, bottom);
                }
            }
            for (let y = rowStart; y <= rowEnd; y++) {
                const isMajor = is8x16Mode ? (y % 16 === 0) : (y % 8 === 0);
                if (!isMajor) {
                    const vy = Math.floor(pan.y + y * scale);
                    const left = Math.max(0, startX);
                    const right = Math.min(viewportW, startX + renderW);
                    if (vy >= 0 && vy <= viewportH) drawLine(ctx, left, vy, right, vy);
                }
            }
            ctx.stroke();

            ctx.beginPath();
            ctx.strokeStyle = 'rgba(15, 56, 15, 0.5)';

            for (let x = 0; x <= spriteW; x += 8) {
                const vx = Math.floor(pan.x + x * scale);
                if (vx >= -1 && vx <= viewportW + 1) {
                    const top = Math.max(0, startY);
                    const bottom = Math.min(viewportH, startY + renderH);
                    drawLine(ctx, vx, top, vx, bottom);
                }
            }

            const strongStep = is8x16Mode ? 16 : 8;
            for (let y = 0; y <= spriteH; y += strongStep) {
                const vy = Math.floor(pan.y + y * scale);
                if (vy >= -1 && vy <= viewportH + 1) {
                    const left = Math.max(0, startX);
                    const right = Math.min(viewportW, startX + renderW);
                    drawLine(ctx, left, vy, right, vy);
                }
            }
            ctx.stroke();
        }

        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.strokeRect(startX - 0.5, startY - 0.5, renderW + 1, renderH + 1);

    }, [canvasRef, grid, spriteW, spriteH, viewportW, viewportH, scale, pan, is8x16Mode, palette]);
};