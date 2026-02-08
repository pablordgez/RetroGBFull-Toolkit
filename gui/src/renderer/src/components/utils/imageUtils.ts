import { GB_PALETTE } from "../SpriteEditor/SpriteEditorConfig";

export const renderTileToDataURL = (
    grid: Uint8Array, 
    width: number, 
    height: number, 
    palette: string[] = GB_PALETTE
): string => {
    // Creates a canvas (in memory)
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Creates an ImageData object
    // data is an array where every 4 values represent the RGBA values of a pixel
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    // For each pixel in the grid it gets the color, converts it to RGB and stores it in the ImageData
    for (let i = 0; i < grid.length; i++) {
        const colorIndex = grid[i];
        const hex = palette[colorIndex] || '#000000';
        
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);

        const pos = i * 4;
        data[pos] = r;
        data[pos + 1] = g;
        data[pos + 2] = b;
        data[pos + 3] = 255;
    }

    // Gets a base64 URL for the image
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/png');
};

