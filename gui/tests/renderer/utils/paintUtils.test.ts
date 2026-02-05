import { describe, expect, it } from "vitest";
import { calculateBrushOps } from "../../../src/renderer/src/components/utils/paintUtils";

describe('paintUtils', () => {
    describe('calculateBrushOps', () => {
        const width = 4;
        const height = 4;
        const currentGrid = new Uint8Array(16).fill(0);
        
        it('should return simple op for single pixel paint', () => {
            const result = calculateBrushOps(
                1, 1,
                1,
                width, height,
                { x: false, y: false },
                currentGrid,
                new Map()
            );

            expect(result.ops).toHaveLength(1);
            expect(result.changes).toHaveLength(1);
            expect(result.ops[0]).toEqual({ index: 5, color: 1 }); // 1*4 + 1 = 5
            expect(result.changes[0]).toEqual({ index: 5, oldColor: 0, newColor: 1 });
        });

        it('should handle symmetry', () => {
            const result = calculateBrushOps(
                0, 0,
                2,
                width, height,
                { x: true, y: true },
                currentGrid,
                new Map()
            );

            expect(result.ops).toHaveLength(4);
            const indices = result.ops.map(o => o.index).sort((a,b) => a-b);
            expect(indices).toEqual([0, 3, 12, 15]);
        });

        it('should use existingChanges to check against pending state', () => {
            const existingChanges = new Map();
            existingChanges.set(5, { oldColor: 0, newColor: 1 });

            const result = calculateBrushOps(
                1, 1,
                1,
                width, height,
                { x: false, y: false },
                currentGrid,
                existingChanges
            );
            
            expect(result.ops).toHaveLength(0);
            expect(result.changes).toHaveLength(0);
        });

        it('should update color if existing change is different', () => {
             const existingChanges = new Map();
             existingChanges.set(5, { oldColor: 0, newColor: 1 });

             const result = calculateBrushOps(
                 1, 1,
                 2, 
                 width, height,
                 { x: false, y: false },
                 currentGrid,
                 existingChanges
             );

             expect(result.ops).toHaveLength(1);
             expect(result.ops[0].color).toBe(2);
             expect(result.changes[0].oldColor).toBe(0);
             expect(result.changes[0].newColor).toBe(2);
        });
    });
});
