import { describe, expect, it, vi } from "vitest";
import { Tileset } from "../../../src/renderer/src/components/Tileset/TilesetModel";
import { Tile } from "../../../src/renderer/src/components/PixelEditor/Tile";

describe('Tileset', () => {
    it('should be instantiated with tiles', () => {
        const tiles: Tile[] = [];
        const tileset = new Tileset(tiles);
        expect(tileset.tiles).toBe(tiles);
    });

    describe('encode', () => {

        it('should return empty tileset data when no tiles are present', () => {
            const tileset = new Tileset([]);
            const encoded = tileset.encode();
            const expected = 'const uint8_t my_tileset_data[] = {\n};\n';
            expect(encoded).toBe(expected);
        });

        it('should encode multiple tiles combined', () => {
            const mockTile1 = {
                encode: () => "0x01,0x02"
            } as unknown as Tile;
            
            const mockTile2 = {
                encode: () => "0x03,0x04"
            } as unknown as Tile;

            const tileset = new Tileset([mockTile1, mockTile2]);
            const encoded = tileset.encode();

            const expected = 
`const uint8_t my_tileset_data[] = {
0x01,0x02,
0x03,0x04
};
`;
            
            expect(encoded).toBe(expected);
        });
    });
});
