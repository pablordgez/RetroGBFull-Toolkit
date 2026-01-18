import { useState, useRef, useEffect } from 'react';
import './style/SpriteEditor.css';

const GB_PALETTE = ['#9bbc0f', '#8bac0f', '#306230', '#0f380f' ];
const ERASER_COLOR = GB_PALETTE[0];

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
    const [width, setWidth] = useState(8);
    const [height, setHeight] = useState(8);
    
    const [inputSize, setInputSize] = useState({ w: '8', h: '8' });
    
    const [grid, setGrid] = useState<string[]>(Array(64).fill(GB_PALETTE[0]));
    const [selectedColor, setSelectedColor] = useState(GB_PALETTE[0]);
    const [zoom, setZoom] = useState(1);
    
    const [history, setHistory] = useState<HistoryAction[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const isDrawing = useRef(false);
    const strokeChanges = useRef<Map<number, { oldColor: string, newColor: string }>>(new Map());
    const drawingTool = useRef<'paint' | 'erase'>('paint');

    useEffect(() => {
        setInputSize({ w: width.toString(), h: height.toString() });
    }, [width, height]);

    const recordAction = (action: HistoryAction) => {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(action);
        if (newHistory.length > 40) newHistory.shift();
        
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    };

    const commitResize = (targetW: number, targetH: number) => {
        const safeW = Math.max(8, targetW);
        const safeH = Math.max(8, targetH);

        if (safeW === width && safeH === height) {
            setInputSize({ w: width.toString(), h: height.toString() });
            return;
        }

        const newGrid = Array(safeW * safeH).fill(GB_PALETTE[0]);

        for (let y = 0; y < Math.min(height, safeH); y++) {
            for (let x = 0; x < Math.min(width, safeW); x++) {
                const oldIndex = y * width + x;
                const newIndex = y * safeW + x;
                if (grid[oldIndex]) newGrid[newIndex] = grid[oldIndex];
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

    const handleInputCommit = () => {
        const w = parseInt(inputSize.w) || 8;
        const h = parseInt(inputSize.h) || 8;
        commitResize(w, h);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleInputCommit();
        }
    };

    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) {
                if (e.shiftKey) {
                    e.preventDefault();
                    handleRedo();
                } else {
                    e.preventDefault();
                    handleUndo();
                }
            }
            
            if (e.key.toLowerCase() === 'y' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleRedo();
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);

        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
        
    }, [historyIndex]);

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

    const startStroke = (e: React.MouseEvent) => {
        isDrawing.current = true;
        strokeChanges.current.clear();
        if (e.button === 2) {
            drawingTool.current = 'erase';
        } else {
            drawingTool.current = 'paint';
        }
    };

    const endStroke = () => {
        if (!isDrawing.current) return;
        isDrawing.current = false;
        
        if (strokeChanges.current.size > 0) {
            recordAction({ 
                type: 'PAINT', 
                changes: Array.from(strokeChanges.current.entries()).map(([i, c]) => ({
                    index: i,
                    oldColor: c.oldColor,
                    newColor: c.newColor
                })) 
            });
            strokeChanges.current.clear();
        }
    };

    const handleUndo = () => {
        if (historyIndex < 0) return;
        const action = history[historyIndex];
        if (action.type === 'PAINT') {
            const newGrid = [...grid];
            action.changes.forEach(({ index, oldColor }) => {
                newGrid[index] = oldColor;
            });
            setGrid(newGrid);
        } else if (action.type === 'RESIZE') {
            setWidth(action.prev.width);
            setHeight(action.prev.height);
            setGrid(action.prev.grid);
        }
        setHistoryIndex(historyIndex - 1);
    };

    const handleRedo = () => {
        if (historyIndex >= history.length - 1) return;
        const action = history[historyIndex + 1];
        if (action.type === 'PAINT') {
            const newGrid = [...grid];
            action.changes.forEach(({ index, newColor }) => {
                newGrid[index] = newColor;
            });
            setGrid(newGrid);
        } else if (action.type === 'RESIZE') {
            setWidth(action.next.width);
            setHeight(action.next.height);
            setGrid(action.next.grid);
        }
        setHistoryIndex(historyIndex + 1);
    };

    const handleWheel = (e: React.WheelEvent) => {
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoom(prev => Math.min(Math.max(0.5, prev + delta), 5));
    };

    return (
        <div style={{ display: 'flex', height: '100%', padding: '20px', gap: '20px', fontFamily: 'sans-serif' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: '200px' }}>
                <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px' }}>
                    <h3>Dimensions</h3>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                        <label>
                            W: 
                            <input 
                                type="number"
                                value={inputSize.w} 
                                onChange={(e) => setInputSize(p => ({ ...p, w: e.target.value }))}
                                onBlur={handleInputCommit}
                                onKeyDown={handleKeyDown}
                                style={{ width: '50px', marginLeft: '5px' }}
                            />
                        </label>
                        <label>
                            H: 
                            <input 
                                type="number" 
                                value={inputSize.h} 
                                onChange={(e) => setInputSize(p => ({ ...p, h: e.target.value }))}
                                onBlur={handleInputCommit}
                                onKeyDown={handleKeyDown}
                                style={{ width: '50px', marginLeft: '5px' }}
                            />
                        </label>
                    </div>
                </div>

            
                <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px' }}>
                    <h3>Palette</h3>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        {GB_PALETTE.map((color) => (
                            <div
                                key={color}
                                onClick={() => setSelectedColor(color)}
                                style={{
                                    width: '30px',
                                    height: '30px',
                                    backgroundColor: color,
                                    border: selectedColor === color ? '3px solid red' : '1px solid #000',
                                    cursor: 'pointer'
                                }}
                            />
                        ))}
                    </div>
                </div>

                <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px' }}>
                    <h3>Tools</h3>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                        <button onClick={handleUndo} disabled={historyIndex < 0}>Undo</button>
                        <button onClick={handleRedo} disabled={historyIndex >= history.length - 1}>Redo</button>
                    </div>
                    <div>
                        <label>Zoom: x{zoom.toFixed(1)}</label>
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                           (Use mouse wheel to zoom)
                        </div>
                    </div>
                </div>
            </div>

            <div 
                onWheel={handleWheel}
                className='grid-container'
            >
                <div 
                    className='grid'
                    style={{
                        gridTemplateColumns: `repeat(${width}, 1fr)`,
                        gridTemplateRows: `repeat(${height}, 1fr)`,
                        transform: `scale(${zoom})`,
                        aspectRatio: `${width} / ${height}`,
                    }}
                    onMouseDownCapture={(e) => startStroke(e)}
                    onMouseUp={endStroke}
                    onMouseLeave={endStroke}
                    onContextMenu={(e) => e.preventDefault()}
                    
                >
                    {grid.map((color, index) => (
                        <div
                            key={index}
                            onMouseDown={() => handlePaint(index)}
                            onMouseEnter={() => { if(isDrawing.current) handlePaint(index); }}
                            style={{
                                width: '100%',
                                height: '100%',
                                backgroundColor: color,
                                userSelect: 'none'
                            }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}