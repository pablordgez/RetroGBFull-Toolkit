// @ts-nocheck
import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { renderTileToDataURL } from "../../../src/renderer/src/components/utils/imageUtils";

describe('imageUtils', () => {
    describe('renderTileToDataURL', () => {
        let originalCreateElement;

        beforeAll(() => {
            // Mock environment if not present
            if (typeof document === 'undefined') {
                global.document = {
                    createElement: () => {}
                };
            }
            originalCreateElement = document.createElement;
        });

        afterAll(() => {
            document.createElement = originalCreateElement;
        });

        it('should create canvas and set pixel data', () => {
             const width = 2;
             const height = 2;
             // 4 pixels: 0, 1, 2, 3
             const grid = new Uint8Array([0, 1, 2, 3]);

             const mockCtx = {
                 createImageData: vi.fn((w, h) => ({
                     data: new Uint8ClampedArray(w * h * 4)
                 })),
                 putImageData: vi.fn(),
             };
             const mockCanvas = {
                 width: 0,
                 height: 0,
                 getContext: vi.fn(() => mockCtx),
                 toDataURL: vi.fn(() => "data:image/png;base64,mock"),
             };

             document.createElement = vi.fn((tag) => {
                 if (tag === 'canvas') return mockCanvas;
                 return {};
             });

             const result = renderTileToDataURL(grid, width, height);

             expect(result).toBe("data:image/png;base64,mock");
             expect(mockCtx.createImageData).toHaveBeenCalledWith(2, 2);
             expect(mockCtx.putImageData).toHaveBeenCalled();
             
             // Check if colors were mapped correctly (GB_PALETTE default)
             // Typically GB_PALETTE is like ["#e0f8cf", "#86c06c", "#306850", "#071821"]
             // Index 0 -> #e0f8cf -> r=224 (e0), g=248 (f8), b=207 (cf)
             // We can check the data in the mocked imageData if we access the object returned by createImageData
             const imageData = mockCtx.createImageData.mock.results[0].value;
             const data = imageData.data;
             
             // Pixel 0 (color 0)
             // We can't strictly know the palette values if it imports from config, unless we mock the config import or pass palette.
             // But the function allows passing palette.
        });

        it('should use provided palette', () => {
            const width = 1;
            const height = 1;
            const grid = new Uint8Array([0]);
            const palette = ["#FF0000", "#00FF00", "#0000FF", "#000000"];

            const mockCtx = {
                 createImageData: vi.fn((w, h) => ({
                     data: new Uint8ClampedArray(w * h * 4)
                 })),
                 putImageData: vi.fn(),
            };
            const mockCanvas = {
                 width: 0,
                 height: 0,
                 getContext: vi.fn(() => mockCtx),
                 toDataURL: vi.fn(() => "result"),
            };
            document.createElement = vi.fn(() => mockCanvas);

            renderTileToDataURL(grid, width, height, palette);

            const imageData = mockCtx.createImageData.mock.results[0].value;
            // Palette[0] is #FF0000 -> 255, 0, 0
            expect(imageData.data[0]).toBe(255);
            expect(imageData.data[1]).toBe(0);
            expect(imageData.data[2]).toBe(0);
            expect(imageData.data[3]).toBe(255); // Alpha
        });

        it('should return empty string if getContext returns null', () => {
            const mockCanvas = {
                width: 0,
                height: 0,
                getContext: vi.fn(() => null),
            };
            document.createElement = vi.fn(() => mockCanvas);

            const result = renderTileToDataURL(new Uint8Array([0]), 1, 1);
            expect(result).toBe('');
        });

        it('should fallback to #000000 if colorIndex is out of bounds', () => {
            const width = 1;
            const height = 1;
            const grid = new Uint8Array([5]); // Out of bounds for the default or provided palette

            const mockCtx = {
                 createImageData: vi.fn((w, h) => ({
                     data: new Uint8ClampedArray(w * h * 4)
                 })),
                 putImageData: vi.fn(),
            };
            const mockCanvas = {
                 width: 0,
                 height: 0,
                 getContext: vi.fn(() => mockCtx),
                 toDataURL: vi.fn(() => "result"),
            };
            document.createElement = vi.fn(() => mockCanvas);

            renderTileToDataURL(grid, width, height, []);

            const imageData = mockCtx.createImageData.mock.results[0].value;
            // Fallback is #000000 -> 0, 0, 0
            expect(imageData.data[0]).toBe(0);
            expect(imageData.data[1]).toBe(0);
            expect(imageData.data[2]).toBe(0);
            expect(imageData.data[3]).toBe(255); // Alpha
        });
    });
});
