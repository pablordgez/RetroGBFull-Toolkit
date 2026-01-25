export const getSymmetryIndices = (
    x: number, 
    y: number, 
    width: number, 
    height: number, 
    symmetry: { x: boolean, y: boolean }
) => {
    const indices = [{ x, y }];
    if (symmetry.x) indices.push({ x: width - 1 - x, y });
    if (symmetry.y) indices.push({ x, y: height - 1 - y });
    if (symmetry.x && symmetry.y) indices.push({ x: width - 1 - x, y: height - 1 - y });
    return indices;
};

export const floodFill = (
    startX: number, 
    startY: number, 
    width: number, 
    height: number,
    getPixel: (x: number, y: number) => number,
    targetColor: number
) => {
    const startIdx = startY * width + startX;
    
    
    const colorToReplace = getPixel(startX, startY);
    if (colorToReplace === undefined) return [];

    const queue = [[startX, startY]];
    const visited = new Set<number>();
    const pixelsToFill: { x: number, y: number, index: number }[] = [];

    while (queue.length > 0) {
        const [cx, cy] = queue.shift()!;
        const idx = cy * width + cx;

        if (visited.has(idx)) continue;
        visited.add(idx);

        if (getPixel(cx, cy) === colorToReplace) {
            pixelsToFill.push({ x: cx, y: cy, index: idx });

            if (cx > 0) queue.push([cx - 1, cy]);
            if (cx < width - 1) queue.push([cx + 1, cy]);
            if (cy > 0) queue.push([cx, cy - 1]);
            if (cy < height - 1) queue.push([cx, cy + 1]);
        }
    }
    
    return pixelsToFill;
};
