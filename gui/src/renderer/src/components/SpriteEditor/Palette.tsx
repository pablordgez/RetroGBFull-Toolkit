import React from 'react';
import { GB_PALETTE } from '../SpriteEditor/SpriteEditorConfig';

interface PaletteProps {
    selectedColor: number;
    onSelect: (color: number) => void;
}

export const Palette: React.FC<PaletteProps> = ({ selectedColor, onSelect }) => (
    <div className="toolbox">
        <h3>Palette</h3>
        <div className="palette-row">
            {GB_PALETTE.map((color, index) => (
                <div
                    key={color}
                    onClick={() => onSelect(index)}
                    className="palette-swatch"
                    style={{
                        backgroundColor: color,
                        border: selectedColor === index ? '4px solid #9a2257' : '2px solid #0f380f',
                        boxShadow: selectedColor === index ? '0 0 8px rgba(0,0,0,0.5)' : 'none',
                        transform: selectedColor === index ? 'scale(1.1)' : 'scale(1)'
                    }}
                />
            ))}
        </div>
    </div>
);