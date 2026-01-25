import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'; 
import '../style/SpriteEditor.css'; 
import { ERASER_COLOR, MAX_GB_WIDTH, MAX_GB_HEIGHT, MAX_HARDWARE_SPRITES, HistoryAction, DEFAULT_W, DEFAULT_H, GB_PALETTE } from './SpriteEditorConfig'; 
import { PixelCanvas } from '../PixelEditor/PixelCanvas'; 
import { useSpriteStats } from '../hooks/useSpriteStats'; 
import { Palette } from './Palette'; 
import { AnimationControls } from './AnimationControls'; 
import { Sprite } from './Sprite';

export const SpriteEditor = () => { 
    const [width, setWidth] = useState(DEFAULT_W); 
    const [height, setHeight] = useState(DEFAULT_H); 
    const [inputSize, setInputSize] = useState({ w: DEFAULT_W.toString(), h: DEFAULT_H.toString() }); 
    const [is8x16Mode, setIs8x16Mode] = useState(false);

    const [frames, setFrames] = useState<Uint8Array[]>([new Uint8Array(DEFAULT_W * DEFAULT_H).fill(0)]);
    const [currentFrame, setCurrentFrame] = useState(0);
    const [palette, setPalette] = useState<string[]>([...GB_PALETTE]);
    const [selectedColor, setSelectedColor] = useState(3);

    const [isPlaying, setIsPlaying] = useState(false);
    const [fps, setFps] = useState(6);

    const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });

    const [tool, setTool] = useState<'brush' | 'fill'>('brush');
    const [symmetry, setSymmetry] = useState({ x: false, y: false });

    const hasInitialized = useRef(false);

    const isDrawing = useRef(false);

    const mouseButtonType = useRef<'paint' | 'erase'>('paint');
    const strokeChanges = useRef<Map<number, { oldColor: number, newColor: number }>>(new Map());

    const [history, setHistory] = useState<HistoryAction[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [exportLabel, setExportLabel] = useState("EXPORT DATA");

    const containerRef = useRef<HTMLDivElement>(null);

    const grid = frames[currentFrame];
    const spriteUsage = useSpriteStats(grid, width, height, is8x16Mode);

    const sprite = useMemo(() => {
        return new Sprite(frames, width, height, fps, is8x16Mode);
    }, [frames, width, height, fps, is8x16Mode]);

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

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                setViewportSize({
                    w: entry.contentRect.width,
                    h: entry.contentRect.height
                });
            }
        });

        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    const fitToScreen = useCallback(() => {
        if (viewportSize.w === 0 || viewportSize.h === 0) return;

        const padding = 40;
        const availW = viewportSize.w - padding;
        const availH = viewportSize.h - padding;
        const newScale = Math.floor(Math.min(availW / width, availH / height));
        const finalScale = Math.max(1, newScale);

        setScale(finalScale);
        setPan({
            x: (viewportSize.w - width * finalScale) / 2,
            y: (viewportSize.h - height * finalScale) / 2
        });
    }, [viewportSize, width, height]);


    useEffect(() => {
        if (!hasInitialized.current && viewportSize.w > 0 && viewportSize.h > 0) {
            fitToScreen();
            hasInitialized.current = true;
        }
    }, [viewportSize, fitToScreen]);

    const screenToWorld = useCallback((screenX: number, screenY: number) => {
        return {
            x: Math.floor((screenX - pan.x) / scale),
            y: Math.floor((screenY - pan.y) / scale)
        };
    }, [pan, scale]);

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
            const targetFrame = new Uint8Array(newFrames[action.frameIndex]);
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
            const targetFrame = new Uint8Array(newFrames[action.frameIndex]);
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

    const handleExport = async () => {
        try {
            const encodedString = sprite.encode();
            await navigator.clipboard.writeText(encodedString);
            setExportLabel("COPIED!");
            setTimeout(() => setExportLabel("EXPORT DATA"), 2000);
        } catch (error) {
            console.error("Export failed:", error);
            setExportLabel("ERROR!");
            setTimeout(() => setExportLabel("EXPORT DATA"), 2000);
        }
    };

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

    const commitResize = () => {
        const safeW = Math.max(1, Math.min(MAX_GB_WIDTH, parseInt(inputSize.w) || 8));
        const safeH = Math.max(1, Math.min(MAX_GB_HEIGHT, parseInt(inputSize.h) || 8));
        setInputSize({ w: safeW.toString(), h: safeH.toString() });

        if (safeW === width && safeH === height) return;

        const resizeFrame = (src: Uint8Array) => {
            const newGrid = new Uint8Array(safeW * safeH).fill(ERASER_COLOR);
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

    const batchPaintPixels = (ops: { index: number, color: number }[]) => {
        if (ops.length === 0) return;

        const newFrames = [...frames];
        const newGrid = new Uint8Array(newFrames[currentFrame]);
        let hasChanges = false;

        ops.forEach(({ index, color }) => {
            if (newGrid[index] !== color) {
                const oldColor = newGrid[index];
                newGrid[index] = color;
                hasChanges = true;

                if (!strokeChanges.current.has(index)) {
                    strokeChanges.current.set(index, { oldColor, newColor: color });
                } else {
                    strokeChanges.current.set(index, { ...strokeChanges.current.get(index)!, newColor: color });
                }
            }
        });

        if (hasChanges) {
            newFrames[currentFrame] = newGrid;
            setFrames(newFrames);
        }
    };

    const getSymmetryIndices = (x: number, y: number) => {
        const indices = [{ x, y }];
        if (symmetry.x) indices.push({ x: width - 1 - x, y });
        if (symmetry.y) indices.push({ x, y: height - 1 - y });
        if (symmetry.x && symmetry.y) indices.push({ x: width - 1 - x, y: height - 1 - y });
        return indices;
    };

    const performFloodFill = useCallback((startX: number, startY: number, targetColor: number) => {
        const startIdx = startY * width + startX;
        const colorToReplace = grid[startIdx];
        if (colorToReplace === targetColor) return;

        const queue = [[startX, startY]];
        const visited = new Set<number>();
        const ops: { index: number, color: number }[] = [];

        while (queue.length > 0) {
            const [cx, cy] = queue.shift()!;
            const idx = cy * width + cx;

            if (visited.has(idx)) continue;
            visited.add(idx);

            if (grid[idx] === colorToReplace) {
                ops.push({ index: idx, color: targetColor });

                if (cx > 0) queue.push([cx - 1, cy]);
                if (cx < width - 1) queue.push([cx + 1, cy]);
                if (cy > 0) queue.push([cx, cy - 1]);
                if (cy < height - 1) queue.push([cx, cy + 1]);
            }
        }

        batchPaintPixels(ops);

        if (strokeChanges.current.size > 0) {
            recordAction({
                type: 'PAINT',
                frameIndex: currentFrame,
                changes: Array.from(strokeChanges.current.entries()).map(([i, c]) => ({ index: i, ...c }))
            });
            strokeChanges.current.clear();
        }
    }, [grid, width, height, currentFrame, batchPaintPixels, recordAction]);

    const drawPoint = useCallback((x: number, y: number, color: number) => {
        const points = getSymmetryIndices(x, y);
        const ops = points
            .filter(p => p.x >= 0 && p.x < width && p.y >= 0 && p.y < height)
            .map(p => ({
                index: p.y * width + p.x,
                color
            }));
        batchPaintPixels(ops);
    }, [getSymmetryIndices, width, height, batchPaintPixels]);

    const handlePixelInput = useCallback((x: number, y: number, type: 'down' | 'move' | 'up' | 'leave', button: number) => {
        if (type === 'leave' || type === 'up') {
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

        if (type === 'down' || (type === 'move' && isDrawing.current)) {
            if (x < 0 || x >= width || y < 0 || y >= height) return;

            if (type === 'down') {
                let actionType: 'paint' | 'erase' = 'paint';
                if (button === 2) actionType = 'erase';
                else if (button === 0) actionType = 'paint';
                else return; 

                setIsPlaying(false);
                mouseButtonType.current = actionType;

                const drawColor = actionType === 'erase' ? ERASER_COLOR : selectedColor;

                if (tool === 'fill' && actionType === 'paint') {
                    performFloodFill(x, y, drawColor);
                } else {
                    isDrawing.current = true;
                    strokeChanges.current.clear();
                    drawPoint(x, y, drawColor);
                }
            } else if (type === 'move') {
                const drawColor = mouseButtonType.current === 'erase' ? ERASER_COLOR : selectedColor;
                drawPoint(x, y, drawColor);
            }
        }
    }, [width, height, currentFrame, tool, selectedColor, performFloodFill, drawPoint, recordAction]);

    const handlePan = useCallback((dx: number, dy: number) => {
        setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    }, []);

    const handleZoom = useCallback((factor: number, centerX: number, centerY: number) => {
        const newScale = Math.max(1, Math.min(200, scale * factor));
        const worldX = (centerX - pan.x) / scale;
        const worldY = (centerY - pan.y) / scale;

        const newPanX = centerX - worldX * newScale;
        const newPanY = centerY - worldY * newScale;

        setScale(newScale);
        setPan({ x: newPanX, y: newPanY });
    }, [scale, pan]);

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

                <div className="toolbox">
                    <h3>Draw Tools</h3>
                    <div className="button-row">
                        <button 
                            style={{ fontWeight: tool === 'brush' ? 'bold' : 'normal', backgroundColor: tool === 'brush' ? '#ddd' : undefined }}
                            onClick={() => setTool('brush')}>
                            Brush
                        </button>
                        <button 
                            style={{ fontWeight: tool === 'fill' ? 'bold' : 'normal', backgroundColor: tool === 'fill' ? '#ddd' : undefined }}
                            onClick={() => setTool('fill')}>
                            Fill
                        </button>
                    </div>
                    <div className="button-row" style={{ marginTop: '8px' }}>
                        <button 
                            style={{ fontWeight: symmetry.x ? 'bold' : 'normal', backgroundColor: symmetry.x ? '#ddd' : undefined }}
                            onClick={() => setSymmetry(s => ({ ...s, x: !s.x }))}>
                            X-Sym
                        </button>
                        <button 
                            style={{ fontWeight: symmetry.y ? 'bold' : 'normal', backgroundColor: symmetry.y ? '#ddd' : undefined }}
                            onClick={() => setSymmetry(s => ({ ...s, y: !s.y }))}>
                            Y-Sym
                        </button>
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
                        newFrames.splice(currentFrame + 1, 0, new Uint8Array(frames[currentFrame]));
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

                <Palette
                    colors={palette}
                    selectedColor={selectedColor}
                    onSelect={setSelectedColor}
                    onReorder={setPalette}
                />

                <div className="toolbox">
                    <h3>History</h3>
                    <div className="button-row">
                        <button onClick={handleUndo} disabled={historyIndex < 0}>Undo</button>
                        <button onClick={handleRedo} disabled={historyIndex >= history.length - 1}>Redo</button>
                    </div>
                    <div className="button-row">
                        <button
                            onClick={handleExport}
                            style={{ backgroundColor: exportLabel === 'COPIED!' ? '#0f380f' : undefined, color: exportLabel === 'COPIED!' ? '#9bbc0f' : undefined }}
                        >
                            {exportLabel}
                        </button>
                    </div>
                    <div className="zoom-controls">
                        <p className="zoom-text">Zoom: {Math.round(scale * 5)}%</p>
                        <button onClick={fitToScreen} className="reset-btn">Reset View</button>
                    </div>
                </div>
            </div>

            <div
                ref={containerRef}
                className="grid-container"
                style={{ overflow: 'hidden', backgroundColor: '#202020' }}
            >
                <PixelCanvas
                    grid={grid}
                    width={width}
                    height={height}
                    palette={palette}
                    gridSize={is8x16Mode ? { w: 8, h: 16 } : { w: 8, h: 8 }}
                    viewportSize={viewportSize}
                    scale={scale}
                    pan={pan}
                    onPixelInput={handlePixelInput}
                    onPan={handlePan}
                    onZoom={handleZoom}
                />
            </div>
        </div>
    );
};