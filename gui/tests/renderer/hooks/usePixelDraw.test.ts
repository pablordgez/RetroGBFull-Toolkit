import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePixelDraw } from '../../../src/renderer/src/components/hooks/usePixelDraw';
import * as PaintUtils from '../../../src/renderer/src/components/utils/paintUtils';
import * as PixelAlgorithms from '../../../src/renderer/src/components/utils/pixelAlgorithms';

vi.mock('../../../src/renderer/src/components/utils/paintUtils', () => ({
    calculateBrushOps: vi.fn()
}));

vi.mock('../../../src/renderer/src/components/utils/pixelAlgorithms', () => ({
    floodFill: vi.fn()
}));

describe('usePixelDraw', () => {
    const WIDTH = 10;
    const HEIGHT = 10;
    const GRID_SIZE = WIDTH * HEIGHT;
    
    const onPaintMock = vi.fn();
    const onRecordHistoryMock = vi.fn();
    let currentGrid: Uint8Array;

    beforeEach(() => {
        vi.clearAllMocks();
        currentGrid = new Uint8Array(GRID_SIZE).fill(0);
        
        (PaintUtils.calculateBrushOps as any).mockImplementation((x, y, color) => {
            const index = y * WIDTH + x;
            return {
                ops: [{ index, color }],
                changes: new Map([[index, { index, oldColor: 0, newColor: color }]])
            };
        });
    });

    const renderDrawHook = () => renderHook(() => usePixelDraw({
        width: WIDTH,
        height: HEIGHT,
        currentGrid,
        onPaint: onPaintMock,
        onRecordHistory: onRecordHistoryMock
    }));

    it('initializes with Brush tool and No Symmetry', () => {
        const { result } = renderDrawHook();
        
        expect(result.current.tool).toBe('brush');
        expect(result.current.symmetry).toEqual({ x: false, y: false });
    });

    it('Draw Cycle: DOWN starts drawing and paints pixels', () => {
        const { result } = renderDrawHook();
        
        act(() => {
            result.current.handleCanvasInput(0, 0, 'down', 0, 1);
        });

        expect(PaintUtils.calculateBrushOps).toHaveBeenCalledWith(
            0, 0, 1, WIDTH, HEIGHT, { x: false, y: false }, currentGrid, expect.any(Map)
        );

        expect(onPaintMock).toHaveBeenCalledTimes(1);
        expect(onPaintMock).toHaveBeenCalledWith([{ index: 0, color: 1 }]);
        expect(onRecordHistoryMock).not.toHaveBeenCalled();
    });

    it('Draw Cycle: MOVE continues drawing if button is held', () => {
        const { result } = renderDrawHook();

        act(() => {
            result.current.handleCanvasInput(0, 0, 'down', 0, 1);
        });

+        act(() => {
            result.current.handleCanvasInput(1, 0, 'move', 0, 1);
        });

        expect(PaintUtils.calculateBrushOps).toHaveBeenCalledTimes(2);
        expect(onPaintMock).toHaveBeenCalledTimes(2);
    });

    it('Draw Cycle: UP ends stroke and records batched history', () => {
        const { result } = renderDrawHook();

        act(() => {
            result.current.handleCanvasInput(0, 0, 'down', 0, 1);
            result.current.handleCanvasInput(1, 0, 'move', 0, 1);
            
            result.current.handleCanvasInput(1, 0, 'up', 0, 1);
        });

        expect(onRecordHistoryMock).toHaveBeenCalledTimes(1);

        const recordedMap = onRecordHistoryMock.mock.calls[0][0] as Map<number, any>;
        expect(recordedMap.size).toBe(2);
        expect(recordedMap.has(0)).toBe(true);
        expect(recordedMap.has(1)).toBe(true);
    });

    it('Right Click triggers Eraser mode', () => {
        const { result } = renderDrawHook();
        const ERASER_COLOR = 99;

        act(() => {
            result.current.handleCanvasInput(5, 5, 'down', 2, 1, ERASER_COLOR);
        });

        expect(PaintUtils.calculateBrushOps).toHaveBeenCalledWith(
            5, 5, ERASER_COLOR, expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything()
        );
    });

    it('Flood Fill: Triggers immediately on DOWN and records history', () => {
        const { result } = renderDrawHook();

        act(() => result.current.setTool('fill'));

        (PixelAlgorithms.floodFill as any).mockReturnValue([
            { index: 10, x: 0, y: 1 }, 
            { index: 11, x: 1, y: 1 }
        ]);

        act(() => {
            result.current.handleCanvasInput(0, 1, 'down', 0, 5);
        });

        expect(PixelAlgorithms.floodFill).toHaveBeenCalled();
        expect(onPaintMock).toHaveBeenCalledWith([
            { index: 10, color: 5 },
            { index: 11, color: 5 }
        ]);
        expect(onRecordHistoryMock).toHaveBeenCalledTimes(1);
    });

    it('Safety: Stops drawing if mouse leaves canvas', () => {
        const { result } = renderDrawHook();

        act(() => {
            result.current.handleCanvasInput(0, 0, 'down', 0, 1);
            result.current.handleCanvasInput(0, 0, 'leave', 0, 1);
        });

        expect(onRecordHistoryMock).toHaveBeenCalledTimes(1);

        onPaintMock.mockClear();
        act(() => {
            result.current.handleCanvasInput(1, 1, 'move', 0, 1);
        });

        expect(onPaintMock).not.toHaveBeenCalled();
    });
    
    it('Ignores input if coordinates are out of bounds', () => {
        const { result } = renderDrawHook();
        
        act(() => {
            result.current.handleCanvasInput(-1, -1, 'down', 0, 1);
        });

        expect(onPaintMock).not.toHaveBeenCalled();
    });


    it('records history if tool is changed and a new DOWN event is received (simulating interrupted stroke)', () => {
        
        const { result } = renderDrawHook();
        act(() => {
            result.current.handleCanvasInput(0, 0, 'down', 0, 1);
        });
        
        expect(onPaintMock).toHaveBeenCalledTimes(1);
        expect(onRecordHistoryMock).not.toHaveBeenCalled();

        act(() => {
            result.current.setTool('fill'); 
        });

        act(() => {
            result.current.handleCanvasInput(5, 5, 'down', 0, 2); 
        });
        
        expect(onRecordHistoryMock.mock.calls.length).toBeGreaterThanOrEqual(1);
        const historyMap = onRecordHistoryMock.mock.calls[0][0] as Map<number, any>;
        expect(historyMap.get(0)).toBeDefined();
    });

    it('records history when mouse leaves the canvas while drawing', () => {
        const { result } = renderDrawHook();

        act(() => {
            result.current.handleCanvasInput(0, 0, 'down', 0, 1);
            result.current.handleCanvasInput(1, 0, 'move', 0, 1);
        });

        expect(onPaintMock).toHaveBeenCalledTimes(2);
        expect(onRecordHistoryMock).not.toHaveBeenCalled();

        act(() => {
            result.current.handleCanvasInput(1, 0, 'leave', 0, 1);
        });

        expect(onRecordHistoryMock).toHaveBeenCalledTimes(1);
    });

    it('handles switching from paint (left) to erase (right) mid-stream if new DOWN received', () => {
        const { result } = renderDrawHook();

        act(() => {
            result.current.handleCanvasInput(0, 0, 'down', 0, 1);
        });

        act(() => {
            result.current.handleCanvasInput(0, 1, 'down', 2, 1, 0); // button 2 = right, eraser color = 0
        });

        expect(onRecordHistoryMock).toHaveBeenCalledTimes(1); 
        
        expect(PaintUtils.calculateBrushOps).toHaveBeenCalledWith(
            0, 1, 0,
            expect.any(Number), expect.any(Number), expect.any(Object), expect.any(Object), expect.any(Map)
        );
    });
    
    it('does not record empty history if brush produces no changes', () => {
        (PaintUtils.calculateBrushOps as any).mockImplementation(() => ({
            ops: [],
            changes: new Map()
        }));

        const { result } = renderDrawHook();

        act(() => {
            result.current.handleCanvasInput(0, 0, 'down', 0, 1);
            result.current.handleCanvasInput(0, 0, 'up', 0, 1);
        });

        expect(onRecordHistoryMock).not.toHaveBeenCalled();
    });

    it('flood fill does nothing if out of bounds', () => {
        const { result } = renderDrawHook();
        act(() => {
            result.current.setTool('fill');
        });

        act(() => {
            result.current.handleCanvasInput(-1, -1, 'down', 0, 1);
        });

        expect(onPaintMock).not.toHaveBeenCalled();
    });
});