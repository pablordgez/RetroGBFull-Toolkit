import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Palette } from '../../../src/renderer/src/components/SpriteEditor/Palette';

describe('<Palette />', () => {
    const defaultColors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00'];
    const mockOnSelect = vi.fn();
    const mockOnReorder = vi.fn();

    const renderPalette = (props = {}) => {
        return render(
            <Palette 
                colors={defaultColors}
                selectedColor={0}
                onSelect={mockOnSelect}
                onReorder={mockOnReorder}
                {...props}
            />
        );
    };

    it('renders the correct number of swatches', () => {
        renderPalette();
        const swatches = document.querySelectorAll('.palette-swatch');
        expect(swatches).toHaveLength(4);
    });

    it('calls onSelect when a swatch is clicked', () => {
        renderPalette();
        const swatches = document.querySelectorAll('.palette-swatch');

        fireEvent.click(swatches[1]);
        expect(mockOnSelect).toHaveBeenCalledWith(1);
    });

    it('handles Drag and Drop reordering correctly', () => {
        renderPalette();
        const swatches = document.querySelectorAll('.palette-swatch');
        const source = swatches[0];
        const target = swatches[2];

        const dataTransfer = {
            setData: vi.fn(),
            getData: vi.fn().mockReturnValue('0'),
            effectAllowed: 'none'
        };

        fireEvent.dragStart(source, { dataTransfer });
        expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', '0');

        fireEvent.drop(target, { dataTransfer });

        expect(mockOnReorder).toHaveBeenCalledTimes(1);
        const newColors = mockOnReorder.mock.calls[0][0];
        
        expect(newColors[0]).toBe('#00FF00');
        expect(newColors[1]).toBe('#0000FF');
        expect(newColors[2]).toBe('#FF0000');
        expect(newColors[3]).toBe('#FFFF00');
    });

    it('prevents default behavior on drag over', () => {
        renderPalette();
        const swatch = document.querySelector('.palette-swatch')!;
        const event = new Event('dragover', { bubbles: true });
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
        
        fireEvent(swatch, event);
        
        expect(preventDefaultSpy).toHaveBeenCalled();
    });
});