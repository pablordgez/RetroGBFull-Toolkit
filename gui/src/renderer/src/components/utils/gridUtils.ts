
export type GridType = Uint8Array | number[];

export const resizeGrid = (
    src: GridType,
    srcWidth: number,
    srcHeight: number,
    targetWidth: number,
    targetHeight: number,
    fillColor: number
): Uint8Array => {
    // Creates a new grid of the new size and fills it with the fill color
    const newGrid = new Uint8Array(targetWidth * targetHeight).fill(fillColor);
    // Goes through the previous grid, only up to the new dimensions, and copies the pixels to the new grid
    for (let y = 0; y < Math.min(srcHeight, targetHeight); y++) {
        for (let x = 0; x < Math.min(srcWidth, targetWidth); x++) {
            newGrid[y * targetWidth + x] = src[y * srcWidth + x];
        }
    }
    return newGrid;
};

export interface GridChange {
    index: number;
    color: number;
}

export const applyGridChanges = (
    grid: GridType,
    changes: GridChange[]
): GridType => {
    const isUint8 = grid instanceof Uint8Array;
    const newGrid = isUint8 ? new Uint8Array(grid) : [...grid];
    changes.forEach(({ index, color }) => {
        newGrid[index] = color;
    });
    return newGrid;
};
