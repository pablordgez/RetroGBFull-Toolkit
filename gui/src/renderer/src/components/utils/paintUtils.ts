import { getSymmetryIndices } from './pixelAlgorithms';
import { GridType } from './gridUtils';

export interface PaintOpResult {
    ops: { index: number, color: number }[];
    changes: { index: number, oldColor: number, newColor: number }[];
}

export const calculateBrushOps = (
    x: number,
    y: number,
    color: number,
    width: number,
    height: number,
    symmetry: { x: boolean; y: boolean },
    currentGrid: GridType,
    existingChanges: Map<number, { oldColor: number, newColor: number }>
): PaintOpResult => {
    const points = getSymmetryIndices(x, y, width, height, symmetry);
    const validPoints = points.filter(p => p.x >= 0 && p.x < width && p.y >= 0 && p.y < height);

    const ops: { index: number; color: number }[] = [];
    const changes: { index: number; oldColor: number; newColor: number }[] = [];

    validPoints.forEach(p => {
        const index = p.y * width + p.x;

        const previousChange = existingChanges.get(index);
        
        // If we already painted this pixel in this stroke with the same color, skip
        if (previousChange && previousChange.newColor === color) return;

        let oldColor = currentGrid[index];
        if (previousChange) {
            oldColor = previousChange.oldColor;
        }

        if (oldColor !== color) {
            changes.push({ index, oldColor, newColor: color });
            ops.push({ index, color });
        }
    });

    return { ops, changes };
};
