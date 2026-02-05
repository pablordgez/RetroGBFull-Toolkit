import { describe, expect, it } from "vitest";
import { getSymmetryIndices, floodFill } from "../../../src/renderer/src/components/utils/pixelAlgorithms";

describe('pixelAlgorithms', () => {
    describe('getSymmetryIndices', () => {
        const width = 10;
        const height = 10;

        it('should return only original point if no symmetry', () => {
            const indices = getSymmetryIndices(2, 2, width, height, { x: false, y: false });
            expect(indices).toHaveLength(1);
            expect(indices[0]).toEqual({ x: 2, y: 2 });
        });

        it('should return horizontal mirror if X symmetry enabled', () => {
            const indices = getSymmetryIndices(2, 2, width, height, { x: true, y: false });
            expect(indices).toHaveLength(2);
            expect(indices).toContainEqual({ x: 2, y: 2 });
            expect(indices).toContainEqual({ x: 7, y: 2 }); // 10 - 1 - 2 = 7
        });

        it('should return vertical mirror if Y symmetry enabled', () => {
            const indices = getSymmetryIndices(2, 2, width, height, { x: false, y: true });
            expect(indices).toHaveLength(2);
            expect(indices).toContainEqual({ x: 2, y: 2 });
            expect(indices).toContainEqual({ x: 2, y: 7 }); // 10 - 1 - 2 = 7
        });

        it('should return 4 points if both defined', () => {
            const indices = getSymmetryIndices(1, 1, width, height, { x: true, y: true });
            expect(indices).toHaveLength(4);
            expect(indices).toContainEqual({ x: 1, y: 1 });
            expect(indices).toContainEqual({ x: 8, y: 1 });
            expect(indices).toContainEqual({ x: 1, y: 8 });
            expect(indices).toContainEqual({ x: 8, y: 8 });
        });
    });

    describe('floodFill', () => {
        const width = 3;
        const height = 3;
        const grid = [
            0, 0, 0,
            0, 1, 0,
            0, 0, 0
        ];
        const getPixel = (x: number, y: number) => grid[y * width + x];

        it('should fill connected components of same color', () => {
            const result = floodFill(0, 0, width, height, getPixel, 2);
            
            expect(result.length).toBe(8);
            const indices = result.map(p => p.index).sort((a,b) => a-b);
            expect(indices).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
        });

        it('should fill isolated region only', () => {
             const grid2 = [1,0,1, 0,1,0, 1,0,1];
             const getPixel2 = (x: number, y: number) => grid2[y*width+x];

             const result = floodFill(1, 1, width, height, getPixel2, 2);
             expect(result.length).toBe(1);
             expect(result[0].index).toBe(4);
        });
    });
});
