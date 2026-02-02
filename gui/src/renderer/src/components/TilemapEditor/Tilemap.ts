export class Tilemap {
    public width: number;
    public height: number;
    public data: Uint8Array;

    constructor(width : number, height: number, data : Uint8Array) {
        this.width = width;
        this.height = height;
        this.data = data;
    }

    encode(): string {
        var output: string = 'const uint8_t tilemap_data[] = {\n';
        for (let i = 0; i < this.data.length; i++) {
            output += `0x${this.data[i].toString(16).toUpperCase().padStart(2, '0')}, `;
            if ((i + 1) % this.width === 0) {
                output += '\n';
            }
        }
        output += '};\n';
        return output;
    }
}