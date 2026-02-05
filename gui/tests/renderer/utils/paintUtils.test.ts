import { describe, expect, it } from "vitest";
import { calculateBrushOps } from "../../../src/renderer/src/components/utils/paintUtils";

describe('paintUtils', () => {
    describe('calculateBrushOps', () => {
        const width = 4;
        const height = 4;
        // 4x4 Grid initialized to 0
        const currentGrid = new Uint8Array(16).fill(0);
        
        it('should return simple op for single pixel paint', () => {
            const result = calculateBrushOps(
                1, 1, // x, y
                1, // color
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

            // Should affect (0,0), (3,0), (0,3), (3,3) -> indices 0, 3, 12, 15
            expect(result.ops).toHaveLength(4);
            const indices = result.ops.map(o => o.index).sort((a,b) => a-b);
            expect(indices).toEqual([0, 3, 12, 15]);
        });

        it('should use existingChanges to check against pending state', () => {
            // Suppose (1,1) (index 5) was already changed from 0 to 1 in this stroke
            const existingChanges = new Map();
            existingChanges.set(5, { oldColor: 0, newColor: 1 });

            // Try to paint same color 1 again at (1,1)
            const result = calculateBrushOps(
                1, 1,
                1,
                width, height,
                { x: false, y: false },
                currentGrid,
                existingChanges
            );
            
            // Should be no-op because newColor matches
            expect(result.ops).toHaveLength(0);
            expect(result.changes).toHaveLength(0);
        });

        it('should update color if existing change is different', () => {
             // Suppose (1,1) was changed to 1, but now we paint 2
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
             // Should track original oldColor from the previous change (0)
             expect(result.changes[0].oldColor).toBe(0);
             expect(result.changes[0].newColor).toBe(2);
        });
    });
});
