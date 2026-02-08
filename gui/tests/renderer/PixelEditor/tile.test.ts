import { describe, expect, it } from "vitest";
import { Tile } from "../../../src/renderer/src/components/PixelEditor/Tile";

describe('Tile', () => {
    it('should be instantiated with data', () => {
        const data = new Uint8Array(64).fill(0);
        const tile = new Tile(data);
        expect(tile.data).toBe(data);
    });

    describe('encode', () => {
        it('should throw error if data length is not 64', () => {
            const tile = new Tile(new Uint8Array(10));
            expect(() => tile.encode()).toThrow("Data length must be 64 for 8x8.");
        });

        it('should encode specific patterns correctly', () => {
            const data = new Uint8Array(64).fill(0);
            data[0] = 1; 
            data[8] = 2;
            data[16] = 3;
            data[24+7] = 1;

            const tile = new Tile(data);
            const encoded = tile.encode();
            
            const expectedParts = [
                "0x80,0x00",
                "0x00,0x80",
                "0x80,0x80",
                "0x01,0x00",
                "0x00,0x00",
                "0x00,0x00",
                "0x00,0x00",
                "0x00,0x00" 
            ];
            
            expect(encoded).toBe(expectedParts.join(","));
        });

        it('should encode a tile with all color 0', () => {
            const tile = new Tile(new Uint8Array(64).fill(0));
            const encoded = tile.encode();
            const expected = new Array(16).fill("0x00").join(",");
            expect(encoded).toBe(expected);
        });

        it('should encode a tile with all color 3', () => {
            const tile = new Tile(new Uint8Array(64).fill(3));
            const encoded = tile.encode();
            const expected = new Array(8).fill("0xFF,0xFF").join(",");
            expect(encoded).toBe(expected);
        });
        
        it('should encode a complex known pattern correctly', () => {
             const data = new Uint8Array(64).fill(0);
             const row0 = [0, 1, 2, 3, 0, 1, 2, 3];
             for(let i=0; i<8; i++) data[i] = row0[i];

             // Low byte: 
             // pos 7 (val 0): 0
             // pos 6 (val 1): 1
             // pos 5 (val 2): 0
             // pos 4 (val 3): 1
             // pos 3 (val 0): 0
             // pos 2 (val 1): 1
             // pos 1 (val 2): 0
             // pos 0 (val 3): 1
             // bits: 01010101 -> 0x55

             // High byte:
             // pos 7 (val 0): 0
             // pos 6 (val 1): 0 
             // pos 5 (val 2): 1
             // pos 4 (val 3): 1
             // pos 3 (val 0): 0
             // pos 2 (val 1): 0
             // pos 1 (val 2): 1
             // pos 0 (val 3): 1
             // bits: 00110011 -> 0x33

             const tile = new Tile(data);
             const encoded = tile.encode();
             
             const firstRow = "0x55,0x33";
             const rest = new Array(7).fill("0x00,0x00").join(",");
             
             expect(encoded).toBe(firstRow + "," + rest);
        });
    });
});
