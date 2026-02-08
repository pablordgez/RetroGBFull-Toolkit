export class Tile{
    public data: Uint8Array;

    constructor(data: Uint8Array){
        this.data = data;
    }

    encode() : string{
        if (this.data.length !== 64) {
            throw new Error("Data length must be 64 for 8x8.");
        }

        let output: string = '';

        for (let i = 0; i < 8; i++) {
            let lowByte = 0;
            let highByte = 0;

            for (let j = 0; j < 8; j++) {
                const color = this.data[i * 8 + j];

                if (color & 0x01) {
                    lowByte |= (1 << (7 - j));
                }

                if (color & 0x02) {
                    highByte |= (1 << (7 - j));
                }
            }

            output += `0x${lowByte.toString(16).toUpperCase().padStart(2, '0')},`;
            output += `0x${highByte.toString(16).toUpperCase().padStart(2, '0')},`;
        }

        return output.slice(0, -1);
    }

}