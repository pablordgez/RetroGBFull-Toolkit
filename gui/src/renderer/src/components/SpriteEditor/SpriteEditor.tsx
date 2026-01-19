import React, { useState, useRef, useEffect, useCallback } from 'react';
import '../style/SpriteEditor.css';
import { 
    GB_PALETTE, ERASER_COLOR, MAX_GB_WIDTH, MAX_GB_HEIGHT, 
    MAX_HARDWARE_SPRITES, MAX_CANVAS_DIMENSION, BASE_100_PERCENT_SIZE,
    HistoryAction 
} from './SpriteEditorConfig';
import { useCanvasRender } from '../hooks/useCanvasRender';
import { useSpriteStats } from '../hooks/useSpriteStats';
import { Palette } from './Palette';
import { AnimationControls } from './AnimationControls';

export const SpriteEditor = () => {
    const [width, setWidth] = useState(16);
    const [height, setHeight] = useState(16);
    const [inputSize, setInputSize] = useState({ w: '16', h: '16' });
    const [is8x16Mode, setIs8x16Mode] = useState(false);

    const [frames, setFrames] = useState<string[][]>([Array(256).fill(GB_PALETTE[0])]);
    const [currentFrame, setCurrentFrame] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [fps, setFps] = useState(6);

    const [selectedColor, setSelectedColor] = useState(GB_PALETTE[3]);
    const [zoom, setZoom] = useState(BASE_100_PERCENT_SIZE);
    const [isAutoZoom, setIsAutoZoom] = useState(true);

    const [history, setHistory] = useState<HistoryAction[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const isDrawing = useRef(false);
    const drawingTool = useRef<'paint' | 'erase'>('paint');
    const strokeChanges = useRef<Map<number, { oldColor: string, newColor: string }>>(new Map());
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const zoomTarget = useRef<{ oldZoom: number, mouseX: number, mouseY: number, contentX: number, contentY: number } | null>(null);
    const frameRequest = useRef<number | null>(null);

    const grid = frames[currentFrame];
    const spriteUsage = useSpriteStats(grid, width, height, is8x16Mode);

    useCanvasRender(canvasRef as React.RefObject<HTMLCanvasElement>, grid, width, height, zoom, is8x16Mode);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isPlaying) {
            interval = setInterval(() => {
                setCurrentFrame(prev => (prev + 1) % frames.length);
            }, 1000 / Math.max(1, fps));
        }
        return () => clearInterval(interval);
    }, [isPlaying, fps, frames.length]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const handleResize = (entries: ResizeObserverEntry[]) => {
            if (!isAutoZoom) return;
            for (const entry of entries) {
                const { width: contentWidth, height: contentHeight } = entry.contentRect;
                const PADDING = 80;
                const newZoom = Math.max(1, Math.floor(Math.min((contentWidth - PADDING) / width, (contentHeight - PADDING) / height)));
                setZoom(newZoom);
            }
        };
        const observer = new ResizeObserver(handleResize);
        observer.observe(container);
        return () => observer.disconnect();
    }, [width, height, isAutoZoom]);

    const recordAction = useCallback((action: HistoryAction) => {
        setHistory(prev => {
            const newHistory = prev.slice(0, historyIndex + 1);
            newHistory.push(action);
            if (newHistory.length > 50) newHistory.shift();
            return newHistory;
        });
        setHistoryIndex(prev => (history.length < 50 ? prev + 1 : 49));
    }, [historyIndex, history.length]);

    const handleUndo = useCallback(() => {
        if (historyIndex < 0) return;
        const action = history[historyIndex];

        if (action.type === 'PAINT') {
            const newFrames = [...frames];
            const targetFrame = [...newFrames[action.frameIndex]];
            action.changes.forEach(({ index, oldColor }) => targetFrame[index] = oldColor);
            newFrames[action.frameIndex] = targetFrame;
            setFrames(newFrames);
            setCurrentFrame(action.frameIndex);
        } else if (action.type === 'RESIZE') {
            setWidth(action.prev.width);
            setHeight(action.prev.height);
            setFrames(action.prev.frames);
            setInputSize({ w: action.prev.width.toString(), h: action.prev.height.toString() });
        } else if (action.type === 'FRAME_OP') {
            setFrames(action.prev.frames);
            setCurrentFrame(action.prev.currentFrame);
        }
        setHistoryIndex(prev => prev - 1);
    }, [history, historyIndex, frames]);

    const handleRedo = useCallback(() => {
        if (historyIndex >= history.length - 1) return;
        const action = history[historyIndex + 1];

        if (action.type === 'PAINT') {
            const newFrames = [...frames];
            const targetFrame = [...newFrames[action.frameIndex]];
            action.changes.forEach(({ index, newColor }) => targetFrame[index] = newColor);
            newFrames[action.frameIndex] = targetFrame;
            setFrames(newFrames);
            setCurrentFrame(action.frameIndex);
        } else if (action.type === 'RESIZE') {
            setWidth(action.next.width);
            setHeight(action.next.height);
            setFrames(action.next.frames);
            setInputSize({ w: action.next.width.toString(), h: action.next.height.toString() });
        } else if (action.type === 'FRAME_OP') {
            setFrames(action.next.frames);
            setCurrentFrame(action.next.currentFrame);
        }
        setHistoryIndex(prev => prev + 1);
    }, [history, historyIndex, frames]);

    useEffect(() => {
        const handleKeys = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key.toLowerCase() === 'z') {
                    e.preventDefault();
                    e.shiftKey ? handleRedo() : handleUndo();
                } else if (e.key.toLowerCase() === 'y') {
                    e.preventDefault();
                    handleRedo();
                }
            }
        };
        window.addEventListener('keydown', handleKeys);
        return () => window.removeEventListener('keydown', handleKeys);
    }, [handleUndo, handleRedo]);

    const handleZoomWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();
        if (isAutoZoom) setIsAutoZoom(false);
        if (frameRequest.current) return;
        
        frameRequest.current = requestAnimationFrame(() => {
            const direction = e.deltaY > 0 ? -1 : 1;
            setZoom(prevZoom => {
                const speed = Math.max(1, Math.round(prevZoom * 0.1));
                const newZoom = Math.min(Math.max(1, prevZoom + (speed * direction)), Math.floor(MAX_CANVAS_DIMENSION / Math.max(width, height)));
                
                if (newZoom !== prevZoom && containerRef.current) {
                    const rect = containerRef.current.getBoundingClientRect();
                    zoomTarget.current = {
                        oldZoom: prevZoom,
                        mouseX: e.clientX - rect.left,
                        mouseY: e.clientY - rect.top,
                        contentX: containerRef.current.scrollLeft + (e.clientX - rect.left),
                        contentY: containerRef.current.scrollTop + (e.clientY - rect.top)
                    };
                }
                return newZoom;
            });
            frameRequest.current = null;
        });
    }, [isAutoZoom, width, height]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        container.addEventListener('wheel', handleZoomWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleZoomWheel);
    }, [handleZoomWheel]);

    useEffect(() => {
        if (zoomTarget.current && containerRef.current) {
            const { mouseX, mouseY, contentX, contentY, oldZoom } = zoomTarget.current;
            const scaleRatio = zoom / oldZoom;
            containerRef.current.scrollLeft = (contentX * scaleRatio) - mouseX;
            containerRef.current.scrollTop = (contentY * scaleRatio) - mouseY;
            zoomTarget.current = null;
        }
    }, [zoom]);

    const commitResize = () => {
        const safeW = Math.max(1, Math.min(MAX_GB_WIDTH, parseInt(inputSize.w) || 8));
        const safeH = Math.max(1, Math.min(MAX_GB_HEIGHT, parseInt(inputSize.h) || 8));
        setInputSize({ w: safeW.toString(), h: safeH.toString() });

        if (safeW === width && safeH === height) return;

        const resizeFrame = (src: string[]) => {
            const newGrid = Array(safeW * safeH).fill(GB_PALETTE[0]);
            for (let y = 0; y < Math.min(height, safeH); y++) {
                for (let x = 0; x < Math.min(width, safeW); x++) {
                    newGrid[y * safeW + x] = src[y * width + x];
                }
            }
            return newGrid;
        };
        const newFrames = frames.map(resizeFrame);
        recordAction({
            type: 'RESIZE',
            prev: { width, height, frames: [...frames] },
            next: { width: safeW, height: safeH, frames: newFrames }
        });
        setWidth(safeW);
        setHeight(safeH);
        setFrames(newFrames);
    };

    const paintPixel = (index: number) => {
        const targetColor = drawingTool.current === 'erase' ? ERASER_COLOR : selectedColor;
        if (grid[index] === targetColor) return;

        const oldColor = grid[index];
        const newFrames = [...frames];
        const newGrid = [...newFrames[currentFrame]];
        newGrid[index] = targetColor;
        newFrames[currentFrame] = newGrid;
        setFrames(newFrames);

        if (!strokeChanges.current.has(index)) {
            strokeChanges.current.set(index, { oldColor, newColor: targetColor });
        } else {
            strokeChanges.current.set(index, { ...strokeChanges.current.get(index)!, newColor: targetColor });
        }
    };

    const handleCanvasMouse = (e: React.MouseEvent, type: 'down' | 'move' | 'up' | 'leave') => {
        if (type === 'down') {
            if (e.button !== 0 && e.button !== 2) return;
            setIsPlaying(false);
        }
        
        if (type === 'up' || type === 'leave') {
            if (isDrawing.current) {
                isDrawing.current = false;
                if (strokeChanges.current.size > 0) {
                    recordAction({
                        type: 'PAINT',
                        frameIndex: currentFrame,
                        changes: Array.from(strokeChanges.current.entries()).map(([i, c]) => ({ index: i, ...c }))
                    });
                }
                strokeChanges.current.clear();
            }
            return;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;
        
        if (type === 'down') {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const col = Math.floor(x / zoom);
            const row = Math.floor(y / zoom);
            if (col < 0 || col >= width || row < 0 || row >= height) return;
            
            isDrawing.current = true;
            drawingTool.current = e.button === 2 ? 'erase' : 'paint';
            strokeChanges.current.clear();
            paintPixel(row * width + col);
        } else if (type === 'move' && isDrawing.current) {
            const rect = canvas.getBoundingClientRect();
            const col = Math.floor((e.clientX - rect.left) / zoom);
            const row = Math.floor((e.clientY - rect.top) / zoom);
            if (col >= 0 && col < width && row >= 0 && row < height) {
                paintPixel(row * width + col);
            }
        }
    };

    return (
        <div className="main-layout">
            <div className="sidebar">
                <div className="toolbox">
                    <h3>Sprite</h3>
                    <div className="input-row">
                        <label>W: <input type="number" value={inputSize.w} onChange={(e) => setInputSize(p => ({ ...p, w: e.target.value }))} onBlur={commitResize} onKeyDown={(e) => e.key === 'Enter' && commitResize()} /></label>
                        <label>H: <input type="number" value={inputSize.h} onChange={(e) => setInputSize(p => ({ ...p, h: e.target.value }))} onBlur={commitResize} onKeyDown={(e) => e.key === 'Enter' && commitResize()} /></label>
                    </div>
                    <div style={{ marginTop: '15px' }}>
                        <label style={{ cursor: 'pointer', fontSize: '1.2em' }}>
                            <input type="checkbox" checked={is8x16Mode} onChange={(e) => setIs8x16Mode(e.target.checked)} style={{ width: 'auto', marginRight: '10px' }} />
                            8x16 Mode
                        </label>
                    </div>
                    <div style={{ marginTop: '15px', fontSize: '1.2em', color: '#0f380f' }}>
                        <strong>Usage:</strong> {spriteUsage} / {MAX_HARDWARE_SPRITES}
                        {spriteUsage > MAX_HARDWARE_SPRITES && <div style={{ color: '#8f0c0c', fontWeight: 'bold' }}>⚠ Limit Exceeded</div>}
                    </div>
                </div>

                <AnimationControls 
                    currentFrame={currentFrame}
                    totalFrames={frames.length}
                    fps={fps}
                    isPlaying={isPlaying}
                    onSetFrame={setCurrentFrame}
                    onTogglePlay={() => setIsPlaying(!isPlaying)}
                    onFpsChange={setFps}
                    onAddFrame={() => {
                        const newFrames = [...frames];
                        newFrames.splice(currentFrame + 1, 0, [...frames[currentFrame]]);
                        recordAction({ type: 'FRAME_OP', prev: { frames, currentFrame }, next: { frames: newFrames, currentFrame: currentFrame + 1 } });
                        setFrames(newFrames);
                        setCurrentFrame(c => c + 1);
                    }}
                    onDeleteFrame={() => {
                        const newFrames = frames.filter((_, i) => i !== currentFrame);
                        const nextIdx = Math.max(0, currentFrame - 1);
                        recordAction({ type: 'FRAME_OP', prev: { frames, currentFrame }, next: { frames: newFrames, currentFrame: nextIdx } });
                        setFrames(newFrames);
                        setCurrentFrame(nextIdx);
                    }}
                />

                <Palette selectedColor={selectedColor} onSelect={setSelectedColor} />

                <div className="toolbox">
                    <h3>Tools</h3>
                    <div className="button-row">
                        <button onClick={handleUndo} disabled={historyIndex < 0}>Undo</button>
                        <button onClick={handleRedo} disabled={historyIndex >= history.length - 1}>Redo</button>
                    </div>
                    <div className="zoom-controls">
                        <p className="zoom-text">Zoom: {isAutoZoom ? 'Fit' : `${Math.round((zoom / BASE_100_PERCENT_SIZE) * 100)}%`}</p>
                        {!isAutoZoom && <button onClick={() => setIsAutoZoom(true)} className="reset-btn">Reset</button>}
                    </div>
                </div>
            </div>

            <div 
                ref={containerRef} 
                className="grid-container" 
                onMouseLeave={(e) => handleCanvasMouse(e, 'leave')} 
                onMouseUp={(e) => handleCanvasMouse(e, 'up')}
                onContextMenu={(e) => e.preventDefault()}
            >
                <div className="canvas-wrapper">
                    <canvas
                        ref={canvasRef}
                        width={width * zoom}
                        height={height * zoom}
                        onMouseDown={(e) => handleCanvasMouse(e, 'down')}
                        onMouseMove={(e) => handleCanvasMouse(e, 'move')}
                        className="pixel-canvas"
                    />
                </div>
            </div>
        </div>
    );
};