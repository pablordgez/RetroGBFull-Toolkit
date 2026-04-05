import { useLayoutEffect, RefObject, useRef, useState } from 'react';

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
    // 0.5 is added because otherwise the lines may look blurry due to how the canvas renders lines between pixels
    // .0 numbers are in the middle of a pixel while .5 numbers are in the border between two pixels
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
    const [imageRenderTick, setImageRenderTick] = useState(0);

    // Runs on render before the render happens
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

        // Gets the region that is visible with the current pan and zoom
        const colStart = Math.max(0, Math.floor(-pan.x / scale));
        const colEnd = Math.min(width, Math.ceil((viewportSize.w - pan.x) / scale));
        const rowStart = Math.max(0, Math.floor(-pan.y / scale));
        const rowEnd = Math.min(height, Math.ceil((viewportSize.h - pan.y) / scale));

        const halfScale = scale / 2;

        ctx.imageSmoothingEnabled = false;

        for (let y = rowStart; y < rowEnd; y++) {
            for (let x = colStart; x < colEnd; x++) {
                // Gets the value to draw in the current position
                const i = y * width + x;
                const value = grid[i];

                // Gets the position within the canvas to draw and the dimension to draw
                const drawX = Math.floor(pan.x + x * scale);
                const drawY = Math.floor(pan.y + y * scale);
                const drawSize = Math.ceil(scale);

                // If painting with a tileset instead of a palette
                if (tileset) {
                    if (value === -1) {
                    } else {
                        // We get the url for the tile image
                        const tileUrl = tileset[value];
                        if (tileUrl) {
                            // If we have already loaded the image we take it from the cache
                            let img = imageCache.current.get(tileUrl);
                            // Else we create a new image with the url and cache it
                            if (!img) {
                                img = new Image();
                                img.onload = () => {
                                    setImageRenderTick((tick) => tick + 1);
                                };
                                img.src = tileUrl;
                                imageCache.current.set(tileUrl, img);
                            }
                            
                            // We draw the image
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

                // If erasing or drawing with transparent color we draw a checkerboard pattern
                if (value === eraserIndex) {
                     ctx.fillStyle = transparencyGridBackground;
                     ctx.fillRect(drawX, drawY, drawSize, drawSize);

                     ctx.fillStyle = transparentColor;
                     ctx.fillRect(drawX, drawY, halfScale, halfScale);
                     ctx.fillRect(drawX + halfScale, drawY + halfScale, halfScale, halfScale);
                } else if (palette[value]) {
                    // Else we draw a rectangle with the color of the pixel
                    ctx.fillStyle = palette[value];
                    ctx.fillRect(drawX, drawY, drawSize, drawSize);
                }
            }
        }

        // We draw grid lines
        // The grid has separate width and height so 8x8 and 8x16 modes are possible
        // First the minor grid lines
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.strokeStyle = gridColor;
        // Vertical lines
        for (let x = colStart; x <= colEnd; x++) {
            // Only if the position does not correspond to a major grid line
            if (x % gridSize.w !== 0) {
                // vx is the X position of the line
                const vx = Math.floor(pan.x + x * scale);
                const top = Math.max(0, startY);
                const bottom = Math.min(viewportSize.h, startY + renderH);
                // Only draw it if it's within the viewport
                if (vx >= 0 && vx <= viewportSize.w) drawLine(ctx, vx, top, vx, bottom);
            }
        }
        // Horizontal lines
        for (let y = rowStart; y <= rowEnd; y++) {
            const isMajor = (y % gridSize.h === 0);
            if (!isMajor) {
                // vy is the Y position of the line
                const vy = Math.floor(pan.y + y * scale);
                const left = Math.max(0, startX);
                const right = Math.min(viewportSize.w, startX + renderW);
                if (vy >= 0 && vy <= viewportSize.h) drawLine(ctx, left, vy, right, vy);
            }
        }
        // Then the major grid lines
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
        
    }, [
        canvasRef, grid, width, height, viewportSize, scale, pan,
        palette, tileset, imageRenderTick, transparentColor, backgroundColor, gridColor,
        majorGridColor, gridSize.w, gridSize.h, eraserIndex
    ]);
};
