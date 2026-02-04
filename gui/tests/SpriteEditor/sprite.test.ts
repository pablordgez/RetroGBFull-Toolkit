import { describe, expect, it } from "vitest";
import { Sprite } from "../../src/renderer/src/components/SpriteEditor/Sprite";
import { Tile } from "../../src/renderer/src/components/PixelEditor/Tile";

describe('encodeSprite', () => {
    it('should encode a one frame color 3 8x8 sprite without metasprite data', () => {
        const data = new Uint8Array(64).fill(3);
        const sprite = new Sprite(
            [data],
            8,
            8,
            12,
            false
        );
        const tile = new Tile(data);
        
        const encoded = sprite.encode();
        const expected = "// size: 1\nconst uint8_t my_sprite_data[] = {\n" + tile.encode() + "\n};";

        expect(encoded.trim()).toBe(expected.trim());
    });

    it('should encode an animation with each 8x8 frame of different color without metasprite data and without the blank frame', () => {
        const frames = [];
        for(let i = 0; i < 4; i++){
            const data = new Uint8Array(64).fill(i);
            frames.push(data);
        }
        const sprite = new Sprite(
            frames,
            8,
            8,
            12,
            false
        );
        const tiles = frames.map(f => new Tile(f));
        tiles.shift();
    
        
        const encoded = sprite.encode();
        let expectedData = 'const uint8_t my_sprite_data[] = {\n' + tiles.map(t => t.encode()).join(',\n') + '\n};';
        expectedData = "// size: 3\n" + expectedData;

        expect(encoded.trim()).toBe(expectedData.trim());

    });

    it('should encode a one frame color 3 8x16 sprite without metasprite data', () => {
        const data = new Uint8Array(128).fill(3);
        const sprite = new Sprite(
            [data],
            8,
            16,
            12,
            true
        );
        const tile1 = new Tile(data.slice(0, 64));
        const tile2 = new Tile(data.slice(64, 128));
        
        const encoded = sprite.encode();
        const expected = "// size: 2\nconst uint8_t my_sprite_data[] = {\n" + tile1.encode() + ',\n' + tile2.encode() + "\n};";

        expect(encoded.trim()).toBe(expected.trim());
    });
});
