import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSpriteStats } from '../../../src/renderer/src/components/hooks/useSpriteStats';

vi.mock('../SpriteEditor/SpriteEditorConfig', () => ({
    ERASER_COLOR: 0
}));

describe('useSpriteStats', () => {
    const createGrid = (w: number, h: number, pixels: [x: number, y: number][]) => {
        const grid = new Uint8Array(w * h).fill(0);
        pixels.forEach(([x, y]) => {
            const index = y * w + x;
            if (index < grid.length) grid[index] = 1;
        });
        return grid;
    };

    it('returns 0 for a completely empty grid', () => {
        const w = 16, h = 16;
        const grid = createGrid(w, h, []);
        
        const { result } = renderHook(() => 
            useSpriteStats(grid, w, h, false)
        );

        expect(result.current).toBe(0);
    });

    it('counts 1 sprite when pixels are within the same 8x8 tile', () => {
        const w = 16, h = 16;
        const grid = createGrid(w, h, [[0, 0], [7, 7]]);
        
        const { result } = renderHook(() => 
            useSpriteStats(grid, w, h, false)
        );

        expect(result.current).toBe(1);
    });

    it('counts 2 sprites when pixels are in adjacent horizontal tiles', () => {
        const w = 16, h = 16;
        const grid = createGrid(w, h, [[7, 0], [8, 0]]);
        
        const { result } = renderHook(() => 
            useSpriteStats(grid, w, h, false)
        );

        expect(result.current).toBe(2);
    });

    it('handles 8x8 Mode: Pixels in vertical stack count as separate sprites', () => {
        const w = 16, h = 16;
        const grid = createGrid(w, h, [[0, 7], [0, 8]]);
        
        const { result } = renderHook(() => 
            useSpriteStats(grid, w, h, false)
        );

        expect(result.current).toBe(2);
    });

    it('handles 8x16 Mode: Pixels in vertical stack count as ONE sprite', () => {
        const w = 16, h = 16;
        const grid = createGrid(w, h, [[0, 7], [0, 8]]);
        
        const { result } = renderHook(() => 
            useSpriteStats(grid, w, h, true)
        );

        expect(result.current).toBe(1);
    });

    it('handles 8x16 Mode: Pixels exceeding 16px height count as new sprite', () => {
        const w = 16, h = 32;
        const grid = createGrid(w, h, [[0, 0], [0, 16]]);
        
        const { result } = renderHook(() => 
            useSpriteStats(grid, w, h, true)
        );

        expect(result.current).toBe(2);
    });

    it('calculates correctly for irregular grid sizes (e.g. 12x12)', () => {
        const w = 12, h = 12;
        const grid = createGrid(w, h, [[11, 11]]);
        
        const { result } = renderHook(() => 
            useSpriteStats(grid, w, h, false)
        );

        expect(result.current).toBe(1);
    });

    it('recalculates when the grid changes', () => {
        const w = 16, h = 16;
        const emptyGrid = createGrid(w, h, []);
        const filledGrid = createGrid(w, h, [[0, 0]]);
        
        const { result, rerender } = renderHook(
            ({ g }) => useSpriteStats(g, w, h, false),
            { initialProps: { g: emptyGrid } }
        );

        expect(result.current).toBe(0);

        rerender({ g: filledGrid });

        expect(result.current).toBe(1);
    });
});