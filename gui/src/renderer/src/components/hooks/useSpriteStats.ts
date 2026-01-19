import { useMemo } from 'react';
import { ERASER_COLOR } from '../SpriteEditor/SpriteEditorConfig';

export const useSpriteStats = (
    grid: string[],
    width: number,
    height: number,
    is8x16Mode: boolean
) => {
    return useMemo(() => {
        let count = 0;
        const tileHeight = is8x16Mode ? 16 : 8;
        const cols = Math.ceil(width / 8);
        const rows = Math.ceil(height / tileHeight);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                let hasPixel = false;
                tileLoop:
                for (let y = 0; y < tileHeight; y++) {
                    for (let x = 0; x < 8; x++) {
                        const pixelX = c * 8 + x;
                        const pixelY = r * tileHeight + y;
                        if (pixelX >= width || pixelY >= height) continue;

                        const index = pixelY * width + pixelX;
                        if (grid[index] !== ERASER_COLOR) {
                            hasPixel = true;
                            break tileLoop;
                        }
                    }
                }
                if (hasPixel) count++;
            }
        }
        return count;
    }, [grid, width, height, is8x16Mode]);
};