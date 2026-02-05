import { describe, expect, it } from "vitest";
import { resizeGrid, applyGridChanges, GridChange } from "../../../src/renderer/src/components/utils/gridUtils";

describe('gridUtils', () => {
    describe('resizeGrid', () => {
        it('should crop grid when resizing to smaller dimensions', () => {
            const src = new Uint8Array([
                1, 2, 3,
                4, 5, 6,
                7, 8, 9
            ]); // 3x3
            const newGrid = resizeGrid(src, 3, 3, 2, 2, 0); // to 2x2
            
            expect(newGrid.length).toBe(4);
            expect(newGrid[0]).toBe(1);
            expect(newGrid[1]).toBe(2);
            expect(newGrid[2]).toBe(4);
            expect(newGrid[3]).toBe(5);
        });

        it('should expand grid and fill with color when resizing to larger dimensions', () => {
            const src = new Uint8Array([
                1, 2,
                3, 4
            ]); // 2x2
            const newGrid = resizeGrid(src, 2, 2, 3, 3, 9); // to 3x3, fill with 9
            
            // Expected:
            // 1 2 9
            // 3 4 9
            // 9 9 9
            expect(newGrid.length).toBe(9);
            expect(newGrid[0]).toBe(1);
            expect(newGrid[1]).toBe(2);
            expect(newGrid[2]).toBe(9);
            expect(newGrid[3]).toBe(3);
            expect(newGrid[4]).toBe(4);
            expect(newGrid[5]).toBe(9);
            expect(newGrid[6]).toBe(9);
            expect(newGrid[7]).toBe(9);
            expect(newGrid[8]).toBe(9);
        });
    });

    describe('applyGridChanges', () => {
        it('should apply changes to a Uint8Array grid without mutating original if possible (implementation creates copy)', () => {
            const grid = new Uint8Array([0, 0, 0, 0]);
            const changes: GridChange[] = [
                { index: 1, color: 1 },
                { index: 3, color: 2 }
            ];
            const newGrid = applyGridChanges(grid, changes);

            expect(newGrid).not.toBe(grid);
            expect(newGrid[1]).toBe(1);
            expect(newGrid[3]).toBe(2);
            expect(grid[1]).toBe(0); 
        });

        it('should apply changes to a number array grid', () => {
            const grid = [0, 0, 0, 0];
            const changes: GridChange[] = [
                { index: 0, color: 5 }
            ];
            const newGrid = applyGridChanges(grid, changes);
            
            expect(newGrid).toEqual([5, 0, 0, 0]);
            expect(grid).toEqual([0, 0, 0, 0]);
        });
    });
});
