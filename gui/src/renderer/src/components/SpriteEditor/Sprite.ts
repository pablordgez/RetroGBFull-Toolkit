import {Tile} from '../PixelEditor/Tile';
export class Sprite{
    public frames: Uint8Array[];
    public width: number;
    public height: number;
    public fps: number;
    public is8x16Mode: boolean;

    constructor(frames: Uint8Array[], width: number, height: number, fps: number, is8x16Mode: boolean){
        this.frames = frames;
        this.width = width;
        this.height = height;
        this.fps = fps;
        this.is8x16Mode = is8x16Mode;
    }

    encode() : string{
        let data = 'const uint8_t my_sprite_data[] = {\n';
        let metasprite_data = '';
        let size = 0;
        for(let i = 0; i < this.frames.length; i++){
            const tiles = this.divideIntoTiles(i);
            metasprite_data += this.encode_metasprite_data(tiles, i);
            for(const tile of tiles){
                if(tile.data.every(v => v == 0)) {
                    continue;
                }
                data += tile.encode() + ',\n';
                size += 1;
            }
        }
        if(this.width == 8 && this.height == 8 || (this.is8x16Mode && this.width == 8 && this.height == 16)){
            return "// size: " + size + "\n" + data.slice(0, -2) + '\n};\n';
        }
        return "// size: " + size + "\n" + data.slice(0, -2) + '\n};\n' + metasprite_data;
    }

    encode_metasprite_data(tiles: Tile[], frame: number) : string {
        let data = 'const metasprite_t my_metasprite_' + frame + '[] = {\n';
        let pivotX = this.width / 2 * -1;
        let pivotY = this.height / 2 * -1;
        let currentX = 0;
        let skippedRows = 0;
        let skippedCols = 0;
        const cols = Math.ceil(this.width / 8);
        const rows = Math.ceil(this.height / (this.is8x16Mode ? 16 : 8));
        for(let i = 0; i < rows; i++){
            for(let j = 0; j < cols; j++){
                if(tiles[i * cols + j].data.every(v => v == 0)) {
                    pivotX += 8;
                    skippedCols += 1;
                    continue;
                }
                currentX += 8;
                data += '{ .dy=' + pivotY + ', .dx=' + pivotX + ', .dtile=' + (i * cols + j) + ', .props=0 },\n';
                pivotX = 8;
                pivotY = 0;
            }
            if(skippedCols == cols){
                skippedRows += 1;
            }
            pivotY = this.is8x16Mode ? 16 : 8;
            pivotX = (currentX - 8) * -1;
        }
        data += 'METASPR_TERM' + '\n};\n';
        return data;
    }

    divideIntoTiles(frame: number) : Tile[] {
        if(this.is8x16Mode){
            return this.divideInto8x16Tiles(frame);
        }
        return this.divideInto8x8Tiles(frame);
    }

    divideInto8x8Tiles(frame: number): Tile[] {
        let tiles: Tile[] = [];
        const cols = Math.ceil(this.width / 8);
        const rows = Math.ceil(this.height / 8);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                let tile = new Uint8Array(64);
                for(let i = 0; i < 8; i++){
                    for(let j = 0; j < 8; j++){
                        const pixelX = c * 8 + j;
                        const pixelY = r * 8 + i;
                        if(pixelX >= this.width || pixelY >= this.height) continue;
                        tile[i * 8 + j] = this.frames[frame][pixelY * this.width + pixelX];
                    }
                }
                tiles.push(new Tile(tile));
            }
        }
        return tiles;
    }

    divideInto8x16Tiles(frame: number): Tile[] {
        let tiles: Tile[] = [];
        const cols = Math.ceil(this.width / 8);
        const rows = Math.ceil(this.height / 16);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                let tile = new Uint8Array(128);
                for(let i = 0; i < 16; i++){
                    for(let j = 0; j < 8; j++){
                        const pixelX = c * 8 + j;
                        const pixelY = r * 16 + i;
                        if(pixelX >= this.width || pixelY >= this.height) continue;
                        tile[i * 8 + j] = this.frames[frame][pixelY * this.width + pixelX];
                    }
                }
                tiles.push(new Tile(tile.slice(0, 64)));
                tiles.push(new Tile(tile.slice(64, 128)));
            }
        }
        return tiles;
    }

}