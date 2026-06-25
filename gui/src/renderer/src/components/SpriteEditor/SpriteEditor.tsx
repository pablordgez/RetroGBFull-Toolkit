import { useState, useEffect, useCallback, useMemo } from 'react';
import '../style/SpriteEditor.css';
import { ERASER_COLOR, MAX_GB_WIDTH, MAX_GB_HEIGHT, MAX_HARDWARE_SPRITES, DEFAULT_W, DEFAULT_H, GB_PALETTE } from './SpriteEditorConfig';
import { PixelCanvas } from '../PixelEditor/PixelCanvas';
import { useSpriteStats } from '../hooks/useSpriteStats';
import { useHistory } from '../hooks/history/useHistory';
import { useUndoRedoShortcuts } from '../hooks/history/useUndoRedoShortcuts';
import { useProjectAssetEditor } from '../hooks/useProjectAssetEditor';
import { usePixelDraw } from '../hooks/usePixelDraw';
import { useViewport } from '../hooks/viewport/useViewport';
import { EditorClosePrompt } from '../ProjectAssets/EditorClosePrompt';
import { Palette } from './Palette';
import { AnimationControls } from './AnimationControls';
import { resizeGrid, applyGridChanges } from '../utils/gridUtils';
import { SpriteAssetDocument, getProjectAssetDisplayName } from '../../../../shared/projectAssets';

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


    const grid = frames[currentFrame];
    const spriteUsage = useSpriteStats(grid, width, height, is8x16Mode);

    const assetDocument = useMemo((): SpriteAssetDocument => {
        return {
            kind: 'sprite',
            version: 1,
            width,
            height,
            fps,
            is8x16Mode,
            currentFrame,
            frames: frames.map((frame) => Array.from(frame)),
            palette,
            selectedColor
        };
    }, [currentFrame, fps, frames, height, is8x16Mode, palette, selectedColor, width]);

    const applyDocument = useCallback((nextDocument: SpriteAssetDocument) => {
        setWidth(nextDocument.width);
        setHeight(nextDocument.height);
        setInputSize({
            w: nextDocument.width.toString(),
            h: nextDocument.height.toString()
        });
        setIs8x16Mode(nextDocument.is8x16Mode);
        setFrames(nextDocument.frames.map((frame) => Uint8Array.from(frame)));
        setCurrentFrame(nextDocument.currentFrame);
        setPalette(nextDocument.palette);
        setSelectedColor(nextDocument.selectedColor);
        setFps(nextDocument.fps);
    }, []);

    const {
        assetPath,
        isClosePromptOpen,
        isDirty,
        isLoaded,
        isSaving,
        saveAsset,
        statusMessage,
        handleCloseDecision
    } = useProjectAssetEditor({
        expectedKind: 'sprite',
        document: assetDocument,
        applyDocument
    });

    // Passed to the usePixelDraw hook, tells it how to draw the pixels
    const onPaint = useCallback((ops: { index: number, color: number }[]) => {
        if (ops.length === 0) return;
        // Takes the frames array, clones it and applies changes to the current frame
        setFrames(prevFrames => {
             const newFrames = [...prevFrames];
             newFrames[currentFrame] = applyGridChanges(newFrames[currentFrame], ops);
             return newFrames;
        });
    }, [currentFrame]);

    // Passed to the usePixelDraw hook, tells it how to record history for the changes
    const onRecordHistory = useCallback((changes: Map<number, { oldColor: number, newColor: number }>) => {
        const frameIdx = currentFrame;
        const changeList = Array.from(changes.entries()).map(([i, c]) => ({ index: i, ...c }));

        record({
            // Initializes a command with the undo and redo functions
            // Undo sets the pixels back to their old color, redo sets them to the new color
            // Also changes the current frame because the user might have changed the frame since drawing
            // and we want to make the changes visible when undoing/redoing
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

    // For animation playback, sets an interval that updates once per frame according to the fps and changes the current frame
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isPlaying) {
            interval = setInterval(() => {
                setCurrentFrame(prev => (prev + 1) % frames.length);
            }, 1000 / Math.max(1, fps));
        }
        return () => clearInterval(interval);
    }, [isPlaying, fps, frames.length]);

    useUndoRedoShortcuts(undo, redo);


    // To avoid a usability issue where if the user starts changing the size to a number that starts with a number smaller than the minimum size
    // it will automatically change to the minimum size and the user won't be able to write the rest of the number
    // we don't impose the size limit in the form, instead when the user finishes changing the size we handle the change
    const commitResize = () => {
        let safeW = Math.max(1, Math.min(MAX_GB_WIDTH, parseInt(inputSize.w) || 8));
        let safeH = Math.max(1, Math.min(MAX_GB_HEIGHT, parseInt(inputSize.h) || 8));
        
        // Width can only be a multiple of 8, height can only be a multiple of 8 in 8x8 mode and a multiple of 16 in 8x16 mode
        const multiple = is8x16Mode ? 16 : 8;
        const minSize = is8x16Mode ? 16 : 8;
        
        safeW = Math.max(8, Math.min(MAX_GB_WIDTH, Math.ceil(safeW / 8) * 8));
        safeH = Math.max(minSize, Math.min(MAX_GB_HEIGHT, Math.ceil(safeH / multiple) * multiple));

        // Reflects the size in the form
        setInputSize({ w: safeW.toString(), h: safeH.toString() });

        if (safeW === width && safeH === height) return;

        const prevFrames = [...frames];
        const prevWidth = width;
        const prevHeight = height;

        // Applies the resize to all frames
        const newFrames = frames.map(src => resizeGrid(src, width, height, safeW, safeH, ERASER_COLOR));
        
        // Records the resize action in the history, it just stores the entire previous state to restore it (much easier to implement and more efficient CPU wise)
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
                    // For adding or deleting frames it stores the previous frames array
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
                    {statusMessage && <div className="editor-status">{statusMessage}</div>}
                    <div className="button-row">
                        <button onClick={undo} disabled={!canUndo}>Undo</button>
                        <button onClick={redo} disabled={!canRedo}>Redo</button>
                    </div>

                    <div className="button-row">
                        <button
                            onClick={() => void saveAsset()}
                            disabled={!isLoaded || isSaving}
                        >
                            {isSaving ? 'Saving...' : isDirty ? 'Save*' : 'Save'}
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
                    testId="sprite-editor-canvas"
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

            {isClosePromptOpen && (
                <EditorClosePrompt
                    assetLabel={getProjectAssetDisplayName(assetPath.split('/').pop() ?? 'Sprite')}
                    isBusy={isSaving}
                    onCloseDecision={(decision) => {
                        void handleCloseDecision(decision);
                    }}
                />
            )}
        </div>
    );
};
