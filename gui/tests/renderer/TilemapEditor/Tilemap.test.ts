import { describe, expect, it } from "vitest";
import { Tilemap } from "../../../src/renderer/src/components/TilemapEditor/Tilemap";

describe('Tilemap', () => {
    it('should be instantiated correctly', () => {
        const data = new Uint8Array(10);
        const tilemap = new Tilemap(5, 2, data);
        expect(tilemap.width).toBe(5);
        expect(tilemap.height).toBe(2);
        expect(tilemap.data).toBe(data);
    });

    describe('encode', () => {
        it('should encode a small tilemap correctly with newlines', () => {
            const data = new Uint8Array([0, 1, 2, 3]);
            const tilemap = new Tilemap(2, 2, data);
            
            const encoded = tilemap.encode();
            
            const expectedChunk = 
`0x00, 0x01, 
0x02, 0x03, 
`;
            expect(encoded).toContain('const uint8_t tilemap_data[] = {');
            expect(encoded).toContain(expectedChunk);
            expect(encoded.endsWith('};\n')).toBe(true);
        });

        it('should format hex values correctly (padding and uppercase)', () => {
            const data = new Uint8Array([10, 255]);
            const tilemap = new Tilemap(2, 1, data);
            
            const encoded = tilemap.encode();
            
            expect(encoded).toContain('0x0A, 0xFF, ');
        });
    });
});
