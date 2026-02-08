import React from 'react';
import { render, fireEvent, screen, createEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PixelCanvas } from '../../../src/renderer/src/components/PixelEditor/PixelCanvas';
import '@testing-library/jest-dom';


vi.mock('./usePixelGridRender', () => ({
    usePixelGridRender: vi.fn()
}));

describe('<PixelCanvas />', () => {
    const defaultProps = {
        grid: new Uint8Array(100),
        width: 10,
        height: 10,
        palette: ['#000', '#fff'],
        viewportSize: { w: 500, h: 500 },
        scale: 10,
        pan: { x: 0, y: 0 },
        onPixelInput: vi.fn(),
        onPan: vi.fn(),
        onZoom: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockCanvasRect = (left: number, top: number) => {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            left, top,
            right: left + 500, bottom: top + 500,
            width: 500, height: 500,
            x: left, y: top,
            toJSON: () => {}
        } as DOMRect);
    };

    it('translates screen coordinates to grid coordinates (Pixel Input)', () => {
        render(<PixelCanvas {...defaultProps} scale={10} pan={{ x: 0, y: 0 }} />);
        mockCanvasRect(100, 100);

        const canvas = document.querySelector('canvas')!;

        fireEvent.mouseDown(canvas, { 
            clientX: 155, 
            clientY: 155, 
            button: 0 
        });

        expect(defaultProps.onPixelInput).toHaveBeenCalledWith(
            5, 5, 'down', 0
        );
    });

    it('accounts for Pan when calculating coordinates', () => {
        render(<PixelCanvas {...defaultProps} scale={10} pan={{ x: -20, y: -20 }} />);
        mockCanvasRect(0, 0);

        const canvas = document.querySelector('canvas')!;


        fireEvent.mouseDown(canvas, { clientX: 30, clientY: 30, button: 0 });

        expect(defaultProps.onPixelInput).toHaveBeenCalledWith(
            5, 5, 'down', 0
        );
    });

    it('handles Middle Mouse Button (Button 1) as Panning', () => {
        render(<PixelCanvas {...defaultProps} />);
        const canvas = document.querySelector('canvas')!;

        fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100, button: 1 });
        
        expect(defaultProps.onPixelInput).not.toHaveBeenCalled();

        fireEvent.mouseMove(canvas, { clientX: 120, clientY: 110 });

        expect(defaultProps.onPan).toHaveBeenCalledWith(20, 10);
    });

    it('stops Panning on Mouse Up', () => {
        render(<PixelCanvas {...defaultProps} />);
        const canvas = document.querySelector('canvas')!;

        fireEvent.mouseDown(canvas, { clientX: 0, clientY: 0, button: 1 });
        fireEvent.mouseUp(canvas, { clientX: 0, clientY: 0, button: 1 });
        fireEvent.mouseMove(canvas, { clientX: 10, clientY: 10 });


        expect(defaultProps.onPan).not.toHaveBeenCalled();
    });

    it('triggers Zoom on Wheel event', () => {
        render(<PixelCanvas {...defaultProps} />);
        const canvas = document.querySelector('canvas')!;
        mockCanvasRect(0, 0);

        fireEvent.wheel(canvas, { deltaY: -100, clientX: 50, clientY: 50 });

        expect(defaultProps.onZoom).toHaveBeenCalledWith(1.1, 50, 50);

        fireEvent.wheel(canvas, { deltaY: 100, clientX: 50, clientY: 50 });

        expect(defaultProps.onZoom).toHaveBeenCalledWith(0.9, 50, 50);
    });

    it('prevents default context menu on Right Click', () => {
        const { container } = render(<PixelCanvas {...defaultProps} />);
        const canvas = container.querySelector('canvas')!;
        const event = createEvent.contextMenu(canvas);
    
        event.preventDefault = vi.fn();

        fireEvent(canvas, event);

        expect(event.preventDefault).toHaveBeenCalled();
    });

    it('triggers onPixelInput("leave") when mouse leaves canvas', () => {
        render(<PixelCanvas {...defaultProps} />);
        const canvas = document.querySelector('canvas')!;

        fireEvent.mouseLeave(canvas);

        expect(defaultProps.onPixelInput).toHaveBeenCalledWith(-1, -1, 'leave', -1);
    });
});