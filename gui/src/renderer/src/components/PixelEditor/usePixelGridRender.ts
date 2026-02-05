import { useLayoutEffect, RefObject, useRef } from 'react';

export interface PixelGridRenderOptions {
    canvasRef: RefObject<HTMLCanvasElement>;
    grid: Uint8Array | number[];
    width: number;
    height: number;
    viewportSize: { w: number, h: number };
    scale: number;
    pan: { x: number, y: number };
    palette: string[];
    tileset?: (string | null)[];
    transparentColor?: string;
    transparencyGridBackground?: string;
    backgroundColor?: string;
    gridColor?: string;
    majorGridColor?: string;
    gridSize?: { w: number, h: number };
    eraserIndex?: number;
}

const drawLine = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) => {
    ctx.moveTo(x1 + 0.5, y1 + 0.5);
    ctx.lineTo(x2 + 0.5, y2 + 0.5);
};

export const usePixelGridRender = ({
    canvasRef,
    grid,
    width,
    height,
    viewportSize,
    scale,
    pan,
    palette,
    tileset,
    transparentColor = 'rgba(15, 56, 15, 0.25)',
    transparencyGridBackground = '#9bbc0f',
    backgroundColor = '#202020',
    gridColor = 'rgba(15, 56, 15, 0.15)',
    majorGridColor = 'rgba(15, 56, 15, 0.5)',
    gridSize = { w: 8, h: 8 },
    eraserIndex = 0
}: PixelGridRenderOptions) => {
    const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, viewportSize.w, viewportSize.h);

        const startX = Math.floor(pan.x);
        const startY = Math.floor(pan.y);
        const renderW = Math.floor(width * scale);
        const renderH = Math.floor(height * scale);

        const colStart = Math.max(0, Math.floor(-pan.x / scale));
        const colEnd = Math.min(width, Math.ceil((viewportSize.w - pan.x) / scale));
        const rowStart = Math.max(0, Math.floor(-pan.y / scale));
        const rowEnd = Math.min(height, Math.ceil((viewportSize.h - pan.y) / scale));

        const halfScale = scale / 2;

        ctx.imageSmoothingEnabled = false;

        for (let y = rowStart; y < rowEnd; y++) {
            for (let x = colStart; x < colEnd; x++) {
                const i = y * width + x;
                const value = grid[i];

                const drawX = Math.floor(pan.x + x * scale);
                const drawY = Math.floor(pan.y + y * scale);
                const drawSize = Math.ceil(scale);

                if (tileset) {
                    if (value === -1) {
                    } else {
                        const tileUrl = tileset[value];
                        if (tileUrl) {
                            let img = imageCache.current.get(tileUrl);
                            if (!img) {
                                img = new Image();
                                img.src = tileUrl;
                                imageCache.current.set(tileUrl, img);
                            }
                            
                            if (img.complete) {
                                ctx.drawImage(img, drawX, drawY, drawSize, drawSize);
                            } else {
                                if(!img.onload) {
                                    img.onload = () => {

                                    }
                                }
                            }
                        }
                    }
                    continue; 
                }

                if (value === eraserIndex) {
                     ctx.fillStyle = transparencyGridBackground;
                     ctx.fillRect(drawX, drawY, drawSize, drawSize);

                     ctx.fillStyle = transparentColor;
                     ctx.fillRect(drawX, drawY, halfScale, halfScale);
                     ctx.fillRect(drawX + halfScale, drawY + halfScale, halfScale, halfScale);
                } else if (palette[value]) {
                    ctx.fillStyle = palette[value];
                    ctx.fillRect(drawX, drawY, drawSize, drawSize);
                }
            }
        }

        if (scale >= 4) {
            ctx.lineWidth = 1;

            ctx.beginPath();
            ctx.strokeStyle = gridColor;

            for (let x = colStart; x <= colEnd; x++) {
                if (x % gridSize.w !== 0) {
                    const vx = Math.floor(pan.x + x * scale);
                    const top = Math.max(0, startY);
                    const bottom = Math.min(viewportSize.h, startY + renderH);
                    if (vx >= 0 && vx <= viewportSize.w) drawLine(ctx, vx, top, vx, bottom);
                }
            }
            for (let y = rowStart; y <= rowEnd; y++) {
                const isMajor = (y % gridSize.h === 0);
                if (!isMajor) {
                    const vy = Math.floor(pan.y + y * scale);
                    const left = Math.max(0, startX);
                    const right = Math.min(viewportSize.w, startX + renderW);
                    if (vy >= 0 && vy <= viewportSize.h) drawLine(ctx, left, vy, right, vy);
                }
            }
            ctx.stroke();

            ctx.beginPath();
            ctx.strokeStyle = majorGridColor;

            for (let x = 0; x <= width; x += gridSize.w) {
                const vx = Math.floor(pan.x + x * scale);
                if (vx >= -1 && vx <= viewportSize.w + 1) {
                    const top = Math.max(0, startY);
                    const bottom = Math.min(viewportSize.h, startY + renderH);
                    drawLine(ctx, vx, top, vx, bottom);
                }
            }
            for (let y = 0; y <= height; y += gridSize.h) {
                const vy = Math.floor(pan.y + y * scale);
                if (vy >= -1 && vy <= viewportSize.h + 1) {
                    const left = Math.max(0, startX);
                    const right = Math.min(viewportSize.w, startX + renderW);
                    drawLine(ctx, left, vy, right, vy);
                }
            }
            ctx.stroke();
        }
    }, [
        canvasRef, grid, width, height, viewportSize, scale, pan,
        palette, transparentColor, backgroundColor, gridColor,
        majorGridColor, gridSize.w, gridSize.h, eraserIndex
    ]);
};
