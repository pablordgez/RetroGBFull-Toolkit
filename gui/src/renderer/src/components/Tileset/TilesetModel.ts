import {Tile} from '../PixelEditor/Tile';
export class Tileset{
    public tiles: Tile[];

    constructor(tiles: Tile[]){
        this.tiles = tiles;
    }

    encode(): string{
        if(this.tiles.length == 0){
            return 'const uint8_t my_tileset_data[] = {\n};\n';
        }
        let data = 'const uint8_t my_tileset_data[] = {\n';
        this.tiles.forEach(tile => {
            data += tile.encode() + ',\n';
        });
        return data.slice(0, -2) + '\n};\n';
    }
}