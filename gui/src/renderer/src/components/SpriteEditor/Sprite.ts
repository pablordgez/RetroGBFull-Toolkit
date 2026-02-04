import { is } from '@electron-toolkit/utils';
import {Tile} from '../PixelEditor/Tile';

export class MetaspriteEntry{
    x: number
    y: number
    dy: number
    dx: number
    dtile: number
    props: number
    constructor(x:number, y:number, dy: number, dx: number, dtile: number, props: number){
        this.dy = dy;
        this.dx = dx;
        this.dtile = dtile;
        this.props = props;
        this.x = x;
        this.y = y;
    }

    getNewEntry(x: number, y: number, dtile: number, props: number): MetaspriteEntry{
        return new MetaspriteEntry(x, y, y - this.y, x - this.x, dtile, props);
    }

    toString(): string{
        return `{ .dy=${this.dy}, .dx=${this.dx}, .dtile=${this.dtile}, .props=${this.props} }`;
    }
}

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
            for(let i = 0; i < tiles.length; i++){
                if(tiles[i].data.every(v => v == 0) && !this.is8x16Mode) {
                    continue;
                } else if(this.is8x16Mode && i %2 == 0 && tiles[i].data.every(v => v == 0) && tiles[i+1].data.every(v => v == 0)){
                    continue;
                }
                data += tiles[i].encode() + ',\n';
                if(!this.is8x16Mode || i %2 == 1){
                    size += 1;
                }
            }
        }
        if(this.width == 8 && this.height == 8 || (this.is8x16Mode && this.width == 8 && this.height == 16)){
            return "// size: " + size + "\n" + data.slice(0, -2) + '\n};\n';
        }
        return "// size: " + size + "\n" + data.slice(0, -2) + '\n};\n' + metasprite_data;
    }

    encode_metasprite_data(tiles: Tile[], frame: number) : string {
        let data = 'const metasprite_t my_metasprite_' + frame + '[] = {\n';
        
        const cols = Math.ceil(this.width / 8);
        const rows = Math.ceil(this.height / (this.is8x16Mode ? 16 : 8));
        let currentTile = -1;
        let entries: MetaspriteEntry[] = [];
        let initialX = this.width / 2;
        let initialY = this.height / 2;
        let templateEntry = new MetaspriteEntry(initialX, initialY, 0, 0, 0, 0);
        let stillInCenter = true;
        
        for(let i = 0; i < rows; i++){
            for(let j = 0; j < cols; j++){
                if(this.is8x16Mode){
                    let upperTile = tiles[i * 2 * cols + j * 2];
                    let lowerTile = tiles[i * 2 * cols + j * 2 + 1];
                    if(upperTile.data.every(v => v == 0) && lowerTile.data.every(v => v == 0)){
                        continue;
                    }
                    currentTile += 1;
                    if(stillInCenter){
                        entries.push(templateEntry.getNewEntry(j * 8, i * 16, currentTile, 0));
                        stillInCenter = false;
                    } else{
                        const lastEntry = entries[entries.length - 1];
                        entries.push(lastEntry.getNewEntry(j * 8, i * 16, currentTile, 0));
                    }
                } else{
                    if(tiles[i * cols + j].data.every(v => v == 0)) {
                        continue;
                    }
                    currentTile += 1;
                    if(stillInCenter){
                    entries.push(templateEntry.getNewEntry(j * 8, i * 8, currentTile, 0));
                    stillInCenter = false;
                    } else{
                        const lastEntry = entries[entries.length - 1];
                        entries.push(lastEntry.getNewEntry(j * 8, i * 8, currentTile, 0));
                    }
                }
                data += entries[entries.length - 1].toString() + ',\n';
            }
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