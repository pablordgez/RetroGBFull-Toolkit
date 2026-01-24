import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'; 
import '../style/SpriteEditor.css'; 
import { ERASER_COLOR, MAX_GB_WIDTH, MAX_GB_HEIGHT, MAX_HARDWARE_SPRITES, HistoryAction, DEFAULT_W, DEFAULT_H, GB_PALETTE } from './SpriteEditorConfig'; 
import { useCanvasRender } from '../hooks/useCanvasRender'; 
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
    const isPanning = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });

    const mouseButtonType = useRef<'paint' | 'erase'>('paint');
    const strokeChanges = useRef<Map<number, { oldColor: number, newColor: number }>>(new Map());

    const [history, setHistory] = useState<HistoryAction[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [exportLabel, setExportLabel] = useState("EXPORT DATA");

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const grid = frames[currentFrame];
    const spriteUsage = useSpriteStats(grid, width, height, is8x16Mode);

    const sprite = useMemo(() => {
        return new Sprite(frames, width, height, fps, is8x16Mode);
    }, [frames, width, height, fps, is8x16Mode]);

    useCanvasRender(
        canvasRef as React.RefObject<HTMLCanvasElement>,
        grid, width, height,
        viewportSize.w, viewportSize.h,
        scale, pan,
        is8x16Mode, palette
    );

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

    const performFloodFill = (startX: number, startY: number, targetColor: number) => {
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
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 1) {
            e.preventDefault();
            isPanning.current = true;
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            return;
        }

        if (e.button === 0 || e.button === 2) {
            setIsPlaying(false);
            const rect = canvasRef.current!.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const { x, y } = screenToWorld(mouseX, mouseY);

            if (x >= 0 && x < width && y >= 0 && y < height) {
                const isRightClick = e.button === 2;
                mouseButtonType.current = isRightClick ? 'erase' : 'paint';

                const drawColor = isRightClick ? ERASER_COLOR : selectedColor;

                if (tool === 'fill' && !isRightClick) {
                    performFloodFill(x, y, drawColor);
                } else {
                    isDrawing.current = true;
                    strokeChanges.current.clear();

                    const points = getSymmetryIndices(x, y);
                    const ops = points
                        .filter(p => p.x >= 0 && p.x < width && p.y >= 0 && p.y < height)
                        .map(p => ({
                            index: p.y * width + p.x,
                            color: drawColor
                        }));
                    batchPaintPixels(ops);
                }
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isPanning.current) {
            const dx = e.clientX - lastMousePos.current.x;
            const dy = e.clientY - lastMousePos.current.y;
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            return;
        }

        if (isDrawing.current && canvasRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            const { x, y } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

            if (x >= 0 && x < width && y >= 0 && y < height) {
                const drawColor = mouseButtonType.current === 'erase' ? ERASER_COLOR : selectedColor;
                const points = getSymmetryIndices(x, y);
                const ops = points
                    .filter(p => p.x >= 0 && p.x < width && p.y >= 0 && p.y < height)
                    .map(p => ({
                        index: p.y * width + p.x,
                        color: drawColor
                    }));
                batchPaintPixels(ops);
            }
        }
    };

    const handleMouseUp = () => {
        isPanning.current = false;

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
    };

    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();

        const rect = containerRef.current!.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldX = (mouseX - pan.x) / scale;
        const worldY = (mouseY - pan.y) / scale;

        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(1, Math.min(200, scale * zoomFactor));

        const newPanX = mouseX - worldX * newScale;
        const newPanY = mouseY - worldY * newScale;

        setScale(newScale);
        setPan({ x: newPanX, y: newPanY });
    }, [scale, pan]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, [handleWheel]);

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
                style={{ overflow: 'hidden', cursor: isPanning.current ? 'grabbing' : tool === 'fill' ? 'crosshair' : 'default', backgroundColor: '#202020' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onContextMenu={(e) => e.preventDefault()}
            >
                <canvas
                    ref={canvasRef}
                    width={viewportSize.w}
                    height={viewportSize.h}
                    className="pixel-canvas"
                    style={{ display: 'block' }}
                />
            </div>
        </div>
    );
};