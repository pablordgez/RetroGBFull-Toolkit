import { describe, expect, it } from "vitest";
import { Sprite, MetaspriteEntry } from "../../../src/renderer/src/components/SpriteEditor/Sprite";
import { Tile } from "../../../src/renderer/src/components/PixelEditor/Tile";

describe('MetaspriteEntry', () => {
    it('should create a valid entry and stringify it', () => {
        const entry = new MetaspriteEntry(10, 20, 5, -5, 1, 0);
        expect(entry.x).toBe(10);
        expect(entry.y).toBe(20);
        expect(entry.dy).toBe(5);
        expect(entry.dx).toBe(-5);
        expect(entry.dtile).toBe(1);
        expect(entry.props).toBe(0);
        expect(entry.toString()).toBe('{ .dy=5, .dx=-5, .dtile=1, .props=0 }');
    });

    it('should calculate relative offsets correctly in getNewEntry', () => {
        const entry1 = new MetaspriteEntry(10, 20, 0, 0, 0, 0);
        const entry2 = entry1.getNewEntry(18, 20, 1, 0);
        
        expect(entry2.x).toBe(18);
        expect(entry2.y).toBe(20);
        expect(entry2.dx).toBe(8);
        expect(entry2.dy).toBe(0);
        expect(entry2.dtile).toBe(1);
        expect(entry2.toString()).toBe('{ .dy=0, .dx=8, .dtile=1, .props=0 }');
        
        const entry3 = entry2.getNewEntry(18, 28, 2, 0);
        expect(entry3.dx).toBe(0);
        expect(entry3.dy).toBe(8);
    });
});

describe('Sprite Helper Methods', () => {
    it('divideIntoTiles should split 16x8 frame into two 8x8 tiles (8x8 mode)', () => {
        const data = new Uint8Array(128);
        for(let r=0; r<8; r++) {
            for(let c=0; c<16; c++) {
                data[r*16 + c] = c < 8 ? 1 : 2;
            }
        }
        
        const sprite = new Sprite([data], 16, 8, 12, false);
        const tiles = sprite.divideIntoTiles(0);
        
        expect(tiles.length).toBe(2);
        expect(tiles[0].data.every(v => v === 1)).toBe(true);
        expect(tiles[1].data.every(v => v === 2)).toBe(true);
    });

    it('divideIntoTiles should split 8x16 frame into two 8x8 tiles for encoding (8x16 mode)', () => {
        const data = new Uint8Array(128);
        for(let r=0; r<16; r++) {
            for(let c=0; c<8; c++) {
                data[r*8 + c] = r < 8 ? 1 : 2;
            }
        }
        
        const sprite = new Sprite([data], 8, 16, 12, true);
        const tiles = sprite.divideIntoTiles(0);
        
        expect(tiles.length).toBe(2);
        expect(tiles[0].data.every(v => v === 1)).toBe(true);
        expect(tiles[1].data.every(v => v === 2)).toBe(true);
    });

    it('divideIntoTiles handles multiple rows and columns', () => {
        const data = new Uint8Array(256);
        for(let r=0; r<16; r++) {
            for(let c=0; c<16; c++) {
                let val = 0;
                if (r < 8 && c < 8) val = 1;
                else if (r < 8 && c >= 8) val = 2;
                else if (r >= 8 && c < 8) val = 3;
                else val = 4;
                
                data[r*16 + c] = val;
            }
        }
        
        const sprite = new Sprite([data], 16, 16, 12, false);
        const tiles = sprite.divideIntoTiles(0);
        
        expect(tiles.length).toBe(4);
        expect(tiles[0].data[0]).toBe(1);
        expect(tiles[1].data[0]).toBe(2);
        expect(tiles[2].data[0]).toBe(3);
        expect(tiles[3].data[0]).toBe(4);
    });
});

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

        const tiles = [new Tile(data.slice(0, 64)), new Tile(data.slice(64, 128))];

  
        
        const encoded = sprite.encode();
        const expected = "// size: 1\nconst uint8_t my_sprite_data[] = {\n" + tiles.map(t => t.encode()).join(',\n') + "\n};";

        expect(encoded.trim()).toBe(expected.trim());
    });

    it('should encode a 16x16 sprite (8x8 mode) as a metasprite', () => {
        const data = new Uint8Array(256).fill(1);
        
        const sprite = new Sprite(
            [data],
            16,
            16,
            0,
            false
        );

        const tileData = new Uint8Array(64).fill(1);
        const tiles = [new Tile(tileData), new Tile(tileData), new Tile(tileData), new Tile(tileData)];

        const encoded = sprite.encode();

        const expectedData = "// size: 4\nconst uint8_t my_sprite_data[] = {\n" + tiles.map(t => t.encode()).join(',\n'); + "\n};\n";
        const expectedMetasprite = 
            "const metasprite_t my_metasprite_0[] = {\n{ .dy=-8, .dx=-8, .dtile=0, .props=0 },\n{ .dy=0, .dx=8, .dtile=1, .props=0 },\n{ .dy=8, .dx=-8, .dtile=2, .props=0 },\n{ .dy=0, .dx=8, .dtile=3, .props=0 },\nMETASPR_TERM\n};";
        
        expect(encoded).toContain(expectedData);
        expect(encoded).toContain(expectedMetasprite);

    });

    it('should skip empty tiles in metasprite and adjust coordinates', () => {
        const data = new Uint8Array(128).fill(0);
        for(let y=0; y<8; y++) {
            for(let x=8; x<16; x++) {
                data[y*16 + x] = 1;
            }
        }

        const sprite = new Sprite([data], 16, 8, 0, false);
        const encoded = sprite.encode();

        const tileData = new Uint8Array(64).fill(1);
        const tileHex = new Tile(tileData).encode();
        
        expect(encoded).toContain(`// size: 1\nconst uint8_t my_sprite_data[] = {\n${tileHex}\n};`);

        const expectedMetasprite = 
`const metasprite_t my_metasprite_0[] = {
{ .dy=-4, .dx=0, .dtile=0, .props=0 },
METASPR_TERM
};`;
        expect(encoded).toContain(expectedMetasprite);
    });

    it('should encode multiple frames with metasprite data', () => {
        const frame1 = new Uint8Array(128).fill(1);
        const frame2 = new Uint8Array(128).fill(2);
        
        const sprite = new Sprite([frame1, frame2], 16, 8, 0, false);
        const encoded = sprite.encode();
        
        expect(encoded).toContain('const metasprite_t my_metasprite_0[] = {');
        expect(encoded).toContain('const metasprite_t my_metasprite_1[] = {');
        
        const expectedMetasprite1 = `const metasprite_t my_metasprite_1[] = {
{ .dy=-4, .dx=-8, .dtile=0, .props=0 },
{ .dy=0, .dx=8, .dtile=1, .props=0 },
METASPR_TERM
};`;
        expect(encoded).toContain(expectedMetasprite1);
    });

    it('should skip entire rows in metasprite (8x8 mode)', () => {
        const data = new Uint8Array(256).fill(0);
        for(let y=8; y<16; y++) {
            for(let x=0; x<16; x++) {
                data[y*16 + x] = 1;
            }
        }
        
        const sprite = new Sprite([data], 16, 16, 0, false);
        const encoded = sprite.encode();

        const tileData = new Uint8Array(64).fill(1);
        const tileHex = new Tile(tileData).encode();
        const expectedDataHeader = "// size: 2\nconst uint8_t my_sprite_data[] = {\n";
        const expectedBody = [tileHex, tileHex].join(',\n');
        expect(encoded).toContain(expectedDataHeader + expectedBody);

        const expectedMetasprite = 
`const metasprite_t my_metasprite_0[] = {
{ .dy=0, .dx=-8, .dtile=0, .props=0 },
{ .dy=0, .dx=8, .dtile=1, .props=0 },
METASPR_TERM
};`;
        expect(encoded).toContain(expectedMetasprite);
    });

    it('should encode 8x16 mode sprite with metasprites', () => {
         const data = new Uint8Array(512).fill(1);
         
         const sprite = new Sprite([data], 16, 32, 0, true);
         const encoded = sprite.encode();
         
         expect(encoded).toContain('// size: 4');
         
         
         const expectedMetasprite = 
`const metasprite_t my_metasprite_0[] = {
{ .dy=-16, .dx=-8, .dtile=0, .props=0 },
{ .dy=0, .dx=8, .dtile=1, .props=0 },
{ .dy=16, .dx=-8, .dtile=2, .props=0 },
{ .dy=0, .dx=8, .dtile=3, .props=0 },
METASPR_TERM
};`;
         expect(encoded).toContain(expectedMetasprite);
    });

    it('should skip rows in 8x16 mode metasprite', () => {
        const data = new Uint8Array(512).fill(0);
        for(let y=16; y<32; y++) {
            for(let x=0; x<16; x++) {
                data[y*16 + x] = 1;
            }
        }
        
        const sprite = new Sprite([data], 16, 32, 0, true);
        const encoded = sprite.encode();
        
        expect(encoded).toContain('// size: 4');
        
        const expectedMetasprite = 
`const metasprite_t my_metasprite_0[] = {
{ .dy=0, .dx=-8, .dtile=0, .props=0 },
{ .dy=0, .dx=8, .dtile=1, .props=0 },
METASPR_TERM
};`;
        expect(encoded).toContain(expectedMetasprite);
    });
});
