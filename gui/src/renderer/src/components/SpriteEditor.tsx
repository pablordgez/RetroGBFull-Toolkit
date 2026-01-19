import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import './style/SpriteEditor.css';

const GB_PALETTE = ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'];
const ERASER_COLOR = GB_PALETTE[0];
const BASE_100_PERCENT_SIZE = 20;

const MAX_GB_WIDTH = 80;
const MAX_GB_HEIGHT = 160;
const MAX_HARDWARE_SPRITES = 40;

const MAX_CANVAS_DIMENSION = 4096; 

type PaintAction = {
    type: 'PAINT';
    changes: { index: number; oldColor: string; newColor: string }[];
};

type ResizeAction = {
    type: 'RESIZE';
    prev: { width: number; height: number; grid: string[] };
    next: { width: number; height: number; grid: string[] };
};

type HistoryAction = PaintAction | ResizeAction;

export const SpriteEditor = () => {
    const [width, setWidth] = useState(16);
    const [height, setHeight] = useState(16);
    const [inputSize, setInputSize] = useState({ w: '16', h: '16' });
    
    const [is8x16Mode, setIs8x16Mode] = useState(false); 
    
    const [grid, setGrid] = useState<string[]>(Array(256).fill(GB_PALETTE[0]));
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


    const spriteUsage = useMemo(() => {
        let count = 0;
        

        const tileHeight = is8x16Mode ? 16 : 8; 
        
        const cols = Math.ceil(width / 8);
        const rows = Math.ceil(height / tileHeight);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                let hasPixel = false;
                

                tileLoop:
                for (let y = 0; y < tileHeight; y++) {
                    for (let x = 0; x < 8; x++) {
                        const pixelX = c * 8 + x;
                        const pixelY = r * tileHeight + y;

                        if (pixelX >= width || pixelY >= height) continue;
                        
                        const index = pixelY * width + pixelX;
                        if (grid[index] !== ERASER_COLOR) {
                            hasPixel = true;
                            break tileLoop;
                        }
                    }
                }
                if (hasPixel) count++;
            }
        }
        return count;
    }, [grid, width, height, is8x16Mode]);

    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        ctx.imageSmoothingEnabled = false;


        ctx.fillStyle = GB_PALETTE[0];
        ctx.fillRect(0, 0, canvas.width, canvas.height);


        for (let i = 0; i < grid.length; i++) {
            if (grid[i] !== GB_PALETTE[0]) {
                const x = (i % width) * zoom;
                const y = Math.floor(i / width) * zoom;
                ctx.fillStyle = grid[i];
                ctx.fillRect(x, y, zoom, zoom);
            }
        }


        if (zoom >= 4) {
            ctx.lineWidth = 1;
            ctx.beginPath();
            

            ctx.strokeStyle = 'rgba(15, 56, 15, 0.15)';
            for (let x = 1; x < width; x++) {
                if (x % 8 !== 0) {
                    ctx.moveTo(x * zoom, 0);
                    ctx.lineTo(x * zoom, height * zoom);
                }
            }
            for (let y = 1; y < height; y++) {

                const isMajorLine = is8x16Mode ? (y % 16 === 0) : (y % 8 === 0);
                if (!isMajorLine) {
                    ctx.moveTo(0, y * zoom);
                    ctx.lineTo(width * zoom, y * zoom);
                }
            }
            ctx.stroke();


            ctx.beginPath();
            ctx.strokeStyle = 'rgba(15, 56, 15, 0.5)';
            

            for (let x = 8; x < width; x += 8) {
                ctx.moveTo(x * zoom, 0);
                ctx.lineTo(x * zoom, height * zoom);
            }


            const strongLineStep = is8x16Mode ? 16 : 8;
            
            for (let y = strongLineStep; y < height; y += strongLineStep) {
                ctx.moveTo(0, y * zoom);
                ctx.lineTo(width * zoom, y * zoom);
            }
            ctx.stroke();
        }

    }, [grid, width, height, zoom, is8x16Mode]); 


    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const handleResize = (entries: ResizeObserverEntry[]) => {
            if (!isAutoZoom) return;
            for (const entry of entries) {
                const { width: contentWidth, height: contentHeight } = entry.contentRect;
                const PADDING = 80; 
                const availableW = contentWidth - PADDING;
                const availableH = contentHeight - PADDING;
                const zoomW = availableW / width;
                const zoomH = availableH / height;
                const newZoom = Math.max(1, Math.floor(Math.min(zoomW, zoomH)));
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
        setHistoryIndex(prev => {
            return (history.length < 50) ? prev + 1 : 49;
        });
    }, [historyIndex, history.length]);

    const handleUndo = useCallback(() => {
        if (historyIndex < 0) return;
        const action = history[historyIndex];
        if (action.type === 'PAINT') {
            setGrid(currentGrid => {
                const newGrid = [...currentGrid];
                action.changes.forEach(({ index, oldColor }) => {
                    newGrid[index] = oldColor;
                });
                return newGrid;
            });
        } else if (action.type === 'RESIZE') {
            setWidth(action.prev.width);
            setHeight(action.prev.height);
            setGrid(action.prev.grid);
            setInputSize({ w: action.prev.width.toString(), h: action.prev.height.toString() });
        }
        setHistoryIndex(prev => prev - 1);
    }, [history, historyIndex]);

    const handleRedo = useCallback(() => {
        if (historyIndex >= history.length - 1) return;
        const action = history[historyIndex + 1];
        if (action.type === 'PAINT') {
            setGrid(currentGrid => {
                const newGrid = [...currentGrid];
                action.changes.forEach(({ index, newColor }) => {
                    newGrid[index] = newColor;
                });
                return newGrid;
            });
        } else if (action.type === 'RESIZE') {
            setWidth(action.next.width);
            setHeight(action.next.height);
            setGrid(action.next.grid);
            setInputSize({ w: action.next.width.toString(), h: action.next.height.toString() });
        }
        setHistoryIndex(prev => prev + 1);
    }, [history, historyIndex]);

    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            const isCmd = e.ctrlKey || e.metaKey;
            const key = e.key.toLowerCase();
            if (isCmd && key === 'z') {
                e.preventDefault();
                e.shiftKey ? handleRedo() : handleUndo();
            }
            if (isCmd && key === 'y') {
                e.preventDefault();
                handleRedo();
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [handleUndo, handleRedo]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            if (isAutoZoom) setIsAutoZoom(false);
            if (frameRequest.current) return;
            frameRequest.current = requestAnimationFrame(() => {
                const direction = e.deltaY > 0 ? -1 : 1; 
                setZoom(prevZoom => {
                    const speed = Math.max(1, Math.round(prevZoom * 0.1)); 
                    let newZoom = prevZoom + (speed * direction);
                    const maxPossibleZoom = Math.floor(MAX_CANVAS_DIMENSION / Math.max(width, height));
                    newZoom = Math.min(Math.max(1, newZoom), maxPossibleZoom);
                    if (newZoom !== prevZoom) {
                        const rect = container.getBoundingClientRect();
                        zoomTarget.current = {
                            oldZoom: prevZoom,
                            mouseX: e.clientX - rect.left,
                            mouseY: e.clientY - rect.top,
                            contentX: container.scrollLeft + (e.clientX - rect.left),
                            contentY: container.scrollTop + (e.clientY - rect.top)
                        };
                    }
                    return newZoom;
                });
                frameRequest.current = null;
            });
        };
        container.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            container.removeEventListener('wheel', onWheel);
            if (frameRequest.current) cancelAnimationFrame(frameRequest.current);
        };
    }, [isAutoZoom, width, height]);

    useLayoutEffect(() => {
        if (zoomTarget.current && containerRef.current) {
            const { mouseX, mouseY, contentX, contentY, oldZoom } = zoomTarget.current;
            const scaleRatio = zoom / oldZoom;
            containerRef.current.scrollLeft = (contentX * scaleRatio) - mouseX;
            containerRef.current.scrollTop = (contentY * scaleRatio) - mouseY;
            zoomTarget.current = null;
        }
    }, [zoom]);

    const commitResize = () => {
        const targetW = parseInt(inputSize.w) || 8;
        const targetH = parseInt(inputSize.h) || 8;
        const safeW = Math.max(1, Math.min(MAX_GB_WIDTH, targetW));
        const safeH = Math.max(1, Math.min(MAX_GB_HEIGHT, targetH));

        setInputSize({ w: safeW.toString(), h: safeH.toString() });

        if (safeW === width && safeH === height) return;

        const newGrid = Array(safeW * safeH).fill(GB_PALETTE[0]);
        for (let y = 0; y < Math.min(height, safeH); y++) {
            for (let x = 0; x < Math.min(width, safeW); x++) {
                const oldIndex = y * width + x;
                const newIndex = y * safeW + x;
                newGrid[newIndex] = grid[oldIndex];
            }
        }

        recordAction({
            type: 'RESIZE',
            prev: { width, height, grid: [...grid] },
            next: { width: safeW, height: safeH, grid: newGrid }
        });

        setWidth(safeW);
        setHeight(safeH);
        setGrid(newGrid);
    };

    const handlePaint = (index: number) => {
        const targetColor = drawingTool.current === 'erase' ? ERASER_COLOR : selectedColor;
        if (grid[index] === targetColor) return;
        const oldColor = grid[index];
        const newGrid = [...grid];
        newGrid[index] = targetColor;
        setGrid(newGrid);
        const currentChanges = strokeChanges.current;
        if (!currentChanges.has(index)) {
            currentChanges.set(index, { oldColor, newColor: targetColor });
        } else {
            const prev = currentChanges.get(index)!;
            currentChanges.set(index, { ...prev, newColor: targetColor });
        }
    };

    const getGridIndexFromEvent = (e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return -1;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const col = Math.floor(x / zoom);
        const row = Math.floor(y / zoom);
        if (col < 0 || col >= width || row < 0 || row >= height) return -1;
        return row * width + col;
    };

    const startStroke = (e: React.MouseEvent) => {
        if (e.button !== 0 && e.button !== 2) return;
        const index = getGridIndexFromEvent(e);
        if (index === -1) return;
        isDrawing.current = true;
        drawingTool.current = e.button === 2 ? 'erase' : 'paint';
        strokeChanges.current.clear();
        handlePaint(index);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDrawing.current) return;
        const index = getGridIndexFromEvent(e);
        if (index !== -1) handlePaint(index);
    };

    const endStroke = () => {
        if (!isDrawing.current) return;
        isDrawing.current = false;
        if (strokeChanges.current.size > 0) {
            recordAction({
                type: 'PAINT',
                changes: Array.from(strokeChanges.current.entries()).map(([i, c]) => ({
                    index: i, oldColor: c.oldColor, newColor: c.newColor
                }))
            });
        }
        strokeChanges.current.clear();
    };

    const getZoomPercentage = () => {
        if (isAutoZoom) return 'Fit';
        const percentage = Math.round((zoom / BASE_100_PERCENT_SIZE) * 100);
        return `${percentage}%`;
    };

    return (
        <div className="main-layout">
            <div className="sidebar">
                <div className="toolbox">
                    <h3>Sprite</h3>
                    <div className="input-row">
                        <label>
                            W: <input 
                                type="number"
                                value={inputSize.w} 
                                onChange={(e) => setInputSize(p => ({ ...p, w: e.target.value }))}
                                onBlur={commitResize}
                                onKeyDown={(e) => e.key === 'Enter' && commitResize()}
                            />
                        </label>
                        <label>
                            H: <input 
                                type="number" 
                                value={inputSize.h} 
                                onChange={(e) => setInputSize(p => ({ ...p, h: e.target.value }))}
                                onBlur={commitResize}
                                onKeyDown={(e) => e.key === 'Enter' && commitResize()}
                            />
                        </label>
                    </div>

                    <div style={{ marginTop: '15px' }}>
                        <label style={{ cursor: 'pointer', fontSize: '1.2em' }}>
                            <input 
                                type="checkbox" 
                                checked={is8x16Mode}
                                onChange={(e) => setIs8x16Mode(e.target.checked)}
                                style={{ width: 'auto', marginRight: '10px' }}
                            />
                            8x16 Mode
                        </label>
                    </div>

                    <div style={{ marginTop: '15px', fontSize: '1.2em', color: '#0f380f' }}>
                        <strong>Usage:</strong> {spriteUsage} / {MAX_HARDWARE_SPRITES}
                        {spriteUsage > MAX_HARDWARE_SPRITES && (
                            <div style={{ color: '#8f0c0c', fontWeight: 'bold' }}>
                                ⚠ Limit Exceeded
                            </div>
                        )}
                    </div>
                </div>

                <div className="toolbox">
                    <h3>Palette</h3>
                    <div className="palette-row">
                        {GB_PALETTE.map((color) => (
                            <div
                                key={color}
                                onClick={() => setSelectedColor(color)}
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

                <div className="toolbox">
                    <h3>Tools</h3>
                    <div className="button-row">
                        <button onClick={handleUndo} disabled={historyIndex < 0}>Undo</button>
                        <button onClick={handleRedo} disabled={historyIndex >= history.length - 1}>Redo</button>
                    </div>
                    <div className="zoom-controls">
                        <p className="zoom-text">Zoom: {getZoomPercentage()}</p>
                        {!isAutoZoom && (
                            <button onClick={() => setIsAutoZoom(true)} className="reset-btn">
                                Reset
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div 
                ref={containerRef}
                className="grid-container"
                onMouseLeave={endStroke}
                onMouseUp={endStroke}
                onContextMenu={(e) => e.preventDefault()}
            >
                <div className="canvas-wrapper">
                    <canvas
                        ref={canvasRef}
                        width={width * zoom}
                        height={height * zoom}
                        onMouseDown={startStroke}
                        onMouseMove={handleMouseMove}
                        className="pixel-canvas"
                    />
                </div>
            </div>
        </div>
    );
}