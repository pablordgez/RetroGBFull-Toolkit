import { useRef, useCallback, useState } from 'react';
import { floodFill, getSymmetryIndices } from '../utils/pixelAlgorithms';

export interface PixelDrawHookProps {
    width: number;
    height: number;
    currentGrid: Uint8Array;
    onPaint: (ops: { index: number, color: number }[]) => void;
    onRecordHistory: (changes: Map<number, { oldColor: number, newColor: number }>) => void;
}

export const usePixelDraw = ({ 
    width, height, currentGrid, onPaint, onRecordHistory 
}: PixelDrawHookProps) => {
    const [tool, setTool] = useState<'brush' | 'fill'>('brush');
    const [symmetry, setSymmetry] = useState({ x: false, y: false });

    // Internal state for current stroke
    const isDrawing = useRef(false);
    const mouseButtonType = useRef<'paint' | 'erase'>('paint');
    const strokeChanges = useRef<Map<number, { oldColor: number, newColor: number }>>(new Map());

    const drawPoint = useCallback((x: number, y: number, color: number) => {
        const points = getSymmetryIndices(x, y, width, height, symmetry);
        
        // Filter valid points
        const validPoints = points.filter(p => p.x >= 0 && p.x < width && p.y >= 0 && p.y < height);
        
        const ops: { index: number, color: number }[] = [];
        
        validPoints.forEach(p => {
            const index = p.y * width + p.x;
            
            const existingChange = strokeChanges.current.get(index);
            if (existingChange && existingChange.newColor === color) return;
            
            let oldColor = currentGrid[index];
            if (existingChange) {
                oldColor = existingChange.oldColor;
            }

            if (oldColor !== color) {
                strokeChanges.current.set(index, { oldColor, newColor: color });
                ops.push({ index, color });
            }
        });

        if (ops.length > 0) {
            onPaint(ops);
        }
    }, [width, height, symmetry, currentGrid, onPaint]);

    const performFloodFill = useCallback((x: number, y: number, color: number) => {

        if (x < 0 || x >= width || y < 0 || y >= height) return;
        
        const targetOldColor = currentGrid[y * width + x];
        if (targetOldColor === color) return; // No op

        const changesList = floodFill(x, y, width, height, (gx, gy) => currentGrid[gy * width + gx], color);
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

    const handleCanvasInput = useCallback((x: number, y: number, type: 'down' | 'move' | 'up' | 'leave', button: number, selectedColor: number, eraserColor: number = 0) => {
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

        if (type === 'down' || (type === 'move' && isDrawing.current)) {
            if (x < 0 || x >= width || y < 0 || y >= height) return;

            if (type === 'down') {
                let actionType: 'paint' | 'erase' = 'paint';
                if (button === 2) actionType = 'erase';
                else if (button === 0) actionType = 'paint';
                else return;

                mouseButtonType.current = actionType;
                
                const drawColor = actionType === 'erase' ? eraserColor : selectedColor;

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
