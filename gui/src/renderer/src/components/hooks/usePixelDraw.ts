import { useRef, useCallback, useState } from 'react';
import { floodFill } from '../utils/pixelAlgorithms';
import { calculateBrushOps } from '../utils/paintUtils';

export interface PixelDrawHookProps {
    width: number;
    height: number;
    currentGrid: Uint8Array;
    onPaint: (ops: { index: number, color: number }[]) => void;
    onRecordHistory: (changes: Map<number, { oldColor: number, newColor: number }>) => void;
}

// Handlers for the operations are passed as parameters, so the hook doesn't need to know about how to actually paint
export const usePixelDraw = ({ 
    width, height, currentGrid, onPaint, onRecordHistory 
}: PixelDrawHookProps) => {
    const [tool, setTool] = useState<'brush' | 'fill'>('brush');
    const [symmetry, setSymmetry] = useState({ x: false, y: false });

    const isDrawing = useRef(false);
    const mouseButtonType = useRef<'paint' | 'erase'>('paint');
    const strokeChanges = useRef<Map<number, { oldColor: number, newColor: number }>>(new Map());

    // Calculates the pixels to paint for a point, adds them to the current stroke changes and calls the onPaint handler
    const drawPoint = useCallback((x: number, y: number, color: number) => {
        const { ops, changes } = calculateBrushOps(
            x, y, color, width, height, symmetry, currentGrid, strokeChanges.current
        );

        if (ops.length > 0) {
            changes.forEach(c => strokeChanges.current.set(c.index, c));
            onPaint(ops);
        }
    }, [width, height, symmetry, currentGrid, onPaint]);

    // Calculates the pixels to paint, records them in a history record and calls the onPaint and onRecordHistory handlers
    const performFloodFill = useCallback((x: number, y: number, color: number) => {

        if (x < 0 || x >= width || y < 0 || y >= height) return;
        
        const targetOldColor = currentGrid[y * width + x];
        if (targetOldColor === color) return;

        const changesList = floodFill(x, y, width, height, (gx, gy) => currentGrid[gy * width + gx]);
        if (changesList.length === 0) return;

        const historyMap = new Map<number, { oldColor: number, newColor: number }>();
        const paintOps: { index: number, color: number }[] = [];

        changesList.forEach(c => {
            historyMap.set(c.index, { oldColor: targetOldColor, newColor: color });
            paintOps.push({ index: c.index, color });
        });

        onPaint(paintOps);
        onRecordHistory(historyMap);

    }, [width, height, currentGrid, onPaint, onRecordHistory]);

    // This function is called from the parent component with the input that happens on the canvas
    // It then handles the painting operations
    // It allows for continuous brush strokes (holding the mouse button and moving) by recording different types of input and checking what it was doing before
    const handleCanvasInput = useCallback((x: number, y: number, type: 'down' | 'move' | 'up' | 'leave', button: number, selectedColor: number, eraserColor: number = 0) => {
        // If the event was that the canvas was left or the mouse button was released, if we are drawing we finish the stroke and record it
        if (type === 'leave' || type === 'up') {
            if (isDrawing.current) {
                isDrawing.current = false;
                if (strokeChanges.current.size > 0) {
                    onRecordHistory(new Map(strokeChanges.current));
                }
                strokeChanges.current.clear();
            }
            return;
        }

        // If we are starting to draw we set up the conditions for the stroke then do the action for the first point
        // If we are moving while drawing, we continue the stroke with the new point
        if (type === 'down' || (type === 'move' && isDrawing.current)) {
            if (x < 0 || x >= width || y < 0 || y >= height) return;

            if (type === 'down') {
                let actionType: 'paint' | 'erase' = 'paint';
                if (button === 2) actionType = 'erase';
                else if (button === 0) actionType = 'paint';
                else return;

                mouseButtonType.current = actionType;
                
                const drawColor = actionType === 'erase' ? eraserColor : selectedColor;

                // If the user changed the tool while drawing, we want to finish the previous stroke with the previous tool before starting the new one
                if(isDrawing.current) {
                    isDrawing.current = false;
                    if (strokeChanges.current.size > 0) {
                        onRecordHistory(new Map(strokeChanges.current));
                    }
                    strokeChanges.current.clear();
                }

                if (tool === 'fill' && actionType === 'paint') {
                    performFloodFill(x, y, drawColor);
                } else {
                    isDrawing.current = true;
                    strokeChanges.current.clear();
                    drawPoint(x, y, drawColor);
                }
            } else if (type === 'move') {
                const drawColor = mouseButtonType.current === 'erase' ? eraserColor : selectedColor;
                drawPoint(x, y, drawColor);
            }
        }
    }, [width, height, tool, drawPoint, performFloodFill, onRecordHistory]);

    return {
        tool, 
        setTool, 
        symmetry, 
        setSymmetry,
        handleCanvasInput
    };
};
