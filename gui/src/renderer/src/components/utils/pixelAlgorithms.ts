// Calculates mirrored indices if symmetry is enabled
export const getSymmetryIndices = (
    x: number, 
    y: number, 
    width: number, 
    height: number, 
    symmetry: { x: boolean, y: boolean }
) => {
    const indices = [{ x, y }];
    // you adjust for index 0
    // then you calculate the mirror by subtracting the index from the width or height
    // this works because if you are calculating the index from the left the mirror will be the same distance from the right
    if (symmetry.x) indices.push({ x: width - 1 - x, y });
    if (symmetry.y) indices.push({ x, y: height - 1 - y });
    if (symmetry.x && symmetry.y) indices.push({ x: width - 1 - x, y: height - 1 - y });
    return indices;
};

// fill algorithm (paint bucket)
// returns the list of pixels to be painted
export const floodFill = (
    startX: number, 
    startY: number, 
    width: number, 
    height: number,
    getPixel: (x: number, y: number) => number) => {
    
    
    const colorToReplace = getPixel(startX, startY);
    if (colorToReplace === undefined) return [];

    const queue = [[startX, startY]];
    const visited = new Set<number>();
    const pixelsToFill: { x: number, y: number, index: number }[] = [];

    // BFS
    while (queue.length > 0) {
        // We get the next pixel's coordinates
        const [cx, cy] = queue.shift()!;
        // We calculate its index
        const idx = cy * width + cx;

        // If we have already visited this pixel, we skip it
        if (visited.has(idx)) continue;
        // We mark the pixel as visited
        visited.add(idx);

        // If the pixel has the color that we want to replace
        if (getPixel(cx, cy) === colorToReplace) {
            // We add it to the list of pixels to fill
            pixelsToFill.push({ x: cx, y: cy, index: idx });

            // We add its neighbors to the queue
            if (cx > 0) queue.push([cx - 1, cy]);
            if (cx < width - 1) queue.push([cx + 1, cy]);
            if (cy > 0) queue.push([cx, cy - 1]);
            if (cy < height - 1) queue.push([cx, cy + 1]);
        }
    }
    
    return pixelsToFill;
};
