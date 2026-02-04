import React, { useState, useEffect, useCallback, useMemo } from 'react';
import '../style/SpriteEditor.css';
import { ERASER_COLOR, MAX_GB_WIDTH, MAX_GB_HEIGHT, MAX_HARDWARE_SPRITES, DEFAULT_W, DEFAULT_H, GB_PALETTE } from './SpriteEditorConfig';
import { PixelCanvas } from '../PixelEditor/PixelCanvas';
import { useSpriteStats } from '../hooks/useSpriteStats';
import { useHistory } from '../hooks/history/useHistory';
import { usePixelDraw } from '../hooks/usePixelDraw';
import { useViewport } from '../hooks/viewport/useViewport';
import { Palette } from './Palette';
import { AnimationControls } from './AnimationControls';
import { Sprite } from './Sprite';
import { resizeGrid, applyGridChanges } from '../utils/gridUtils';

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

    const { 
        viewportSize, scale, pan, 
        containerRef, fitToScreen, handleZoom, handlePan 
    } = useViewport(width, height);

    const { 
        record, undo, redo, 
        canUndo, canRedo 
    } = useHistory();
    const [exportLabel, setExportLabel] = useState("EXPORT DATA");


    const grid = frames[currentFrame];
    const spriteUsage = useSpriteStats(grid, width, height, is8x16Mode);

    const sprite = useMemo(() => {
        return new Sprite(frames, width, height, fps, is8x16Mode);
    }, [frames, width, height, fps, is8x16Mode]);

    const onPaint = useCallback((ops: { index: number, color: number }[]) => {
        if (ops.length === 0) return;
        setFrames(prevFrames => {
             const newFrames = [...prevFrames];
             newFrames[currentFrame] = applyGridChanges(newFrames[currentFrame], ops);
             return newFrames;
        });
    }, [currentFrame]);

    const onRecordHistory = useCallback((changes: Map<number, { oldColor: number, newColor: number }>) => {
        const frameIdx = currentFrame;
        const changeList = Array.from(changes.entries()).map(([i, c]) => ({ index: i, ...c }));

        record({
            undo: () => {
                setFrames(f => {
                    const newF = [...f];
                    const ops = changeList.map(c => ({ index: c.index, color: c.oldColor }));
                    newF[frameIdx] = applyGridChanges(newF[frameIdx], ops);
                    return newF;
                });
                setCurrentFrame(frameIdx);
            },
            redo: () => {
                setFrames(f => {
                    const newF = [...f];
                    const ops = changeList.map(c => ({ index: c.index, color: c.newColor }));
                    newF[frameIdx] = applyGridChanges(newF[frameIdx], ops);
                    return newF;
                });
                setCurrentFrame(frameIdx);
            }
        });
    }, [currentFrame, record]);

    const { 
        tool, setTool, 
        symmetry, setSymmetry, 
        handleCanvasInput: handleCanvasInputInternal 
    } = usePixelDraw({
        width, height, currentGrid: grid,
        onPaint,
        onRecordHistory
    });

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isPlaying) {
            interval = setInterval(() => {
                setCurrentFrame(prev => (prev + 1) % frames.length);
            }, 1000 / Math.max(1, fps));
        }
        return () => clearInterval(interval);
    }, [isPlaying, fps, frames.length]);



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
                    e.shiftKey ? redo() : undo();
                } else if (e.key.toLowerCase() === 'y') {
                    e.preventDefault();
                    redo();
                }
            }
        };
        window.addEventListener('keydown', handleKeys);
        return () => window.removeEventListener('keydown', handleKeys);
    }, [undo, redo]);

    const commitResize = () => {
        const safeW = Math.max(1, Math.min(MAX_GB_WIDTH, parseInt(inputSize.w) || 8));
        const safeH = Math.max(1, Math.min(MAX_GB_HEIGHT, parseInt(inputSize.h) || 8));
        setInputSize({ w: safeW.toString(), h: safeH.toString() });

        if (safeW === width && safeH === height) return;

        const prevFrames = [...frames];
        const prevWidth = width;
        const prevHeight = height;

        const newFrames = frames.map(src => resizeGrid(src, width, height, safeW, safeH, ERASER_COLOR));
        
        record({
            undo: () => {
                setWidth(prevWidth);
                setHeight(prevHeight);
                setFrames(prevFrames);
                setInputSize({ w: prevWidth.toString(), h: prevHeight.toString() });
            },
            redo: () => {
                setWidth(safeW);
                setHeight(safeH);
                setFrames(newFrames);
                setInputSize({ w: safeW.toString(), h: safeH.toString() });
            }
        });

        setWidth(safeW);
        setHeight(safeH);
        setFrames(newFrames);
    };

    const handleCanvasInput = (x: number, y: number, type: 'down' | 'move' | 'up' | 'leave', button: number) => {
        handleCanvasInputInternal(x, y, type, button, selectedColor, ERASER_COLOR);
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
                        
                        const prevFrames = [...frames];
                        const prevFrame = currentFrame;
                        const nextFrames = [...newFrames];
                        const nextFrame = currentFrame + 1;

                        record({
                            undo: () => {
                                setFrames(prevFrames);
                                setCurrentFrame(prevFrame);
                            },
                            redo: () => {
                                setFrames(nextFrames);
                                setCurrentFrame(nextFrame);
                            }
                        });

                        setFrames(newFrames);
                        setCurrentFrame(c => c + 1);
                    }}
                    onDeleteFrame={() => {
                        const newFrames = frames.filter((_, i) => i !== currentFrame);
                        const nextIdx = Math.max(0, currentFrame - 1);
                        
                        const prevFrames = [...frames];
                        const prevFrame = currentFrame;

                        record({
                            undo: () => {
                                setFrames(prevFrames);
                                setCurrentFrame(prevFrame);
                            },
                            redo: () => {
                                setFrames(newFrames);
                                setCurrentFrame(nextIdx);
                            }
                        });

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
                    <h3>Misc</h3>
                    <div className="button-row">
                        <button onClick={undo} disabled={!canUndo}>Undo</button>
                        <button onClick={redo} disabled={!canRedo}>Redo</button>
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
                    onPixelInput={handleCanvasInput}
                    onPan={handlePan}
                    onZoom={handleZoom}
                />
            </div>
        </div>
    );
};