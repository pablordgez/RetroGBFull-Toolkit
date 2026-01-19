import React from 'react';
import { GB_PALETTE } from '../SpriteEditor/SpriteEditorConfig';

interface PaletteProps {
    selectedColor: string;
    onSelect: (color: string) => void;
}

export const Palette: React.FC<PaletteProps> = ({ selectedColor, onSelect }) => (
    <div className="toolbox">
        <h3>Palette</h3>
        <div className="palette-row">
            {GB_PALETTE.map((color) => (
                <div
                    key={color}
                    onClick={() => onSelect(color)}
                    className="palette-swatch"
                    style={{
                        backgroundColor: color,
                        border: selectedColor === color ? '4px solid #9a2257' : '2px solid #0f380f',
                        boxShadow: selectedColor === color ? '0 0 8px rgba(0,0,0,0.5)' : 'none',
                        transform: selectedColor === color ? 'scale(1.1)' : 'scale(1)'
                    }}
                />
            ))}
        </div>
    </div>
);