import { getSymmetryIndices } from './pixelAlgorithms';
import { GridType } from './gridUtils';

export interface PaintOpResult {
    ops: { index: number, color: number }[];
    changes: { index: number, oldColor: number, newColor: number }[];
}


// Builds the list of painted pixels for a painted point (taking into account symmetry and if there is any change)
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
    // Gets the symmetry for the point
    const points = getSymmetryIndices(x, y, width, height, symmetry);
    // Bound check (not really needed right now, but good in case the symmetry function changes)
    const validPoints = points.filter(p => p.x >= 0 && p.x < width && p.y >= 0 && p.y < height);

    const ops: { index: number; color: number }[] = [];
    const changes: { index: number; oldColor: number; newColor: number }[] = [];

    validPoints.forEach(p => {
        // Calculate the index
        const index = p.y * width + p.x;

        // Check if there is already a change for the pixel
        const previousChange = existingChanges.get(index);
        
        // If the pixel has been painted with the same color we skip it
        if (previousChange && previousChange.newColor === color) return;

        let oldColor = currentGrid[index];
        if (previousChange) {
            oldColor = previousChange.oldColor;
        }

        // If the old color is different from the new color, we record the change and the operation
        if (oldColor !== color) {
            changes.push({ index, oldColor, newColor: color });
            ops.push({ index, color });
        }
    });

    return { ops, changes };
};
