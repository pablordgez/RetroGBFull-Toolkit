import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import '../style/SpriteEditor.css';
import { DEFAULT_W, DEFAULT_H, GB_PALETTE, ERASER_COLOR } from '../SpriteEditor/SpriteEditorConfig';
import { PixelCanvas } from '../PixelEditor/PixelCanvas';
import { useHistory } from '../hooks/history/useHistory';
import { useViewport } from '../hooks/viewport/useViewport';
import { usePixelDraw } from '../hooks/usePixelDraw';
import { Palette } from '../SpriteEditor/Palette';
import { Tileset, TilesetRef } from './Tileset';
import { Tileset as TilesetClass } from './TilesetModel';
import { Tile } from '../PixelEditor/Tile';
import { renderTileToDataURL } from '../utils/imageUtils';

export const TilesetEditor = () => {
    const width = 8;
    const height = 8;

    const [tilesData, setTilesData] = useState<Uint8Array[]>([new Uint8Array(width * height).fill(ERASER_COLOR)]);
    const [selectedTileIndex, setSelectedTileIndex] = useState(0);
    const [palette, setPalette] = useState<string[]>([...GB_PALETTE]);
    const [selectedColor, setSelectedColor] = useState(3);

    const tilesetRef = useRef<TilesetRef>(null);

    const { 
        viewportSize, scale, pan, 
        containerRef, fitToScreen, handleZoom, handlePan 
    } = useViewport(width, height);

    const { record, undo, redo, canUndo, canRedo } = useHistory();
    const [exportLabel, setExportLabel] = useState("EXPORT DATA");

    const currentGrid = tilesData[selectedTileIndex] || new Uint8Array(width * height).fill(ERASER_COLOR);

    const tilesetObject = useMemo(() => {
        return new TilesetClass(tilesData.map(t => new Tile(t)));
    }, [tilesData]);

    const onPaint = useCallback((ops: { index: number, color: number }[]) => {
        if (ops.length === 0) return;
        
        setTilesData(prev => {
            const newData = [...prev];
            if (!newData[selectedTileIndex]) {
                newData[selectedTileIndex] = new Uint8Array(width * height).fill(ERASER_COLOR);
            }
            
            const newGrid = new Uint8Array(newData[selectedTileIndex]);
            ops.forEach(({ index, color }) => {
                newGrid[index] = color;
            });
            newData[selectedTileIndex] = newGrid;

            
            return newData;
        });
    }, [selectedTileIndex, width, height]);

    useEffect(() => {
        const grid = tilesData[selectedTileIndex];
        if (grid && tilesetRef.current) {
            const url = renderTileToDataURL(grid, width, height, palette);
            tilesetRef.current.updateTile(selectedTileIndex, url);
        }
    }, [tilesData, selectedTileIndex, palette, width, height]);

    const tilesDataRef = useRef(tilesData);
    useEffect(() => { tilesDataRef.current = tilesData; }, [tilesData]);

    useEffect(() => {
        if (tilesetRef.current) {
             tilesDataRef.current.forEach((grid, index) => {
                const url = renderTileToDataURL(grid, width, height, palette);
                tilesetRef.current?.updateTile(index, url);
            });
        }
    }, [palette, width, height]);


    const onRecordHistory = useCallback((changes: Map<number, { oldColor: number, newColor: number }>) => {
        const tileIdx = selectedTileIndex;
        const changeList = Array.from(changes.entries()).map(([i, c]) => ({ index: i, ...c }));
        
        record({
            undo: () => {
                setTilesData(prev => {
                    const newD = [...prev];
                    const target = new Uint8Array(newD[tileIdx]);
                    changeList.forEach(({ index, oldColor }) => target[index] = oldColor);
                    newD[tileIdx] = target;
                    return newD;
                });
                setSelectedTileIndex(tileIdx);
            },
            redo: () => {
                 setTilesData(prev => {
                    const newD = [...prev];
                    const target = new Uint8Array(newD[tileIdx]);
                    changeList.forEach(({ index, newColor }) => target[index] = newColor);
                    newD[tileIdx] = target;
                    return newD;
                });
                setSelectedTileIndex(tileIdx);
            }
        });
    }, [selectedTileIndex, record]);

    const { 
        tool, setTool, 
        symmetry, setSymmetry, 
        handleCanvasInput: handleCanvasInputInternal 
    } = usePixelDraw({
        width, height, currentGrid,
        onPaint,
        onRecordHistory
    });

    const handleCanvasInput = (x: number, y: number, type: 'down' | 'move' | 'up' | 'leave', button: number) => {
        handleCanvasInputInternal(x, y, type, button, selectedColor, ERASER_COLOR);
    };

    const handleSelectTile = (index: number) => {
        if (index >= tilesData.length) {
             setTilesData(prev => {
                const newD = [...prev];
                while (newD.length <= index) {
                    newD.push(new Uint8Array(width * height).fill(ERASER_COLOR));
                }
                return newD;
            });
        }
        
        setSelectedTileIndex(index);
    };

    const handleRemoveTile = (index: number) => {
         const prevData = [...tilesData];
         const prevSelected = selectedTileIndex;
         
         const newData = [...tilesData];
         newData.splice(index, 1);
         if (newData.length === 0) newData.push(new Uint8Array(width * height).fill(ERASER_COLOR));

         const newSelected = index >= newData.length ? Math.max(0, newData.length - 1) : index;

         setTilesData(newData);
         setSelectedTileIndex(newSelected);
         tilesetRef.current?.removeTile(index);

         record({
             undo: () => {
                 setTilesData(prevData);
                 setSelectedTileIndex(prevSelected);
                 prevData.forEach((grid, i) => {
                     const url = renderTileToDataURL(grid, width, height, palette);
                     tilesetRef.current?.updateTile(i, url);
                 });
             },
             redo: () => {
                 setTilesData(newData);
                 setSelectedTileIndex(newSelected);
                 tilesetRef.current?.removeTile(index);
             }
         });
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

    const handleExport = async () => {
        try {
            const encodedString = tilesetObject.encode();
            await navigator.clipboard.writeText(encodedString);
            setExportLabel("COPIED!");
            setTimeout(() => setExportLabel("EXPORT DATA"), 2000);
        } catch (error) {
            console.error("Export failed:", error);
            setExportLabel("ERROR!");
            setTimeout(() => setExportLabel("EXPORT DATA"), 2000);
        }
    };


    return (
        <div className="main-layout">
            <div className="sidebar" style={{ width: '220px' }}>
                <Tileset 
                    ref={tilesetRef} 
                    onSelectTile={handleSelectTile}
                    onRemoveTile={handleRemoveTile}
                    className="sidebar-tileset"
                />
                
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
                </div>

                <Palette
                    colors={palette}
                    selectedColor={selectedColor}
                    onSelect={setSelectedColor}
                    onReorder={setPalette}
                />

                <div className="toolbox">
                    <h3>History</h3>
                    <div className="button-row">
                        <button onClick={undo} disabled={!canUndo}>Undo</button>
                        <button onClick={redo} disabled={!canRedo}>Redo</button>
                    </div>
                     <div className="zoom-controls">
                        <p className="zoom-text">Zoom: {Math.round(scale * 5)}%</p>
                        <button onClick={fitToScreen} className="reset-btn">Reset View</button>
                    </div>
                </div>

                <div className="toolbox">
                    <div style={{ marginTop: '15px', fontSize: '1.2em', color: '#0f380f' }}>
                         <button onClick={handleExport} style={{ width: '100%', padding: '10px', fontWeight: 'bold' }}>{exportLabel}</button>
                    </div>
                </div>
            </div>

            <div
                ref={containerRef}
                className="grid-container"
                style={{ overflow: 'hidden', backgroundColor: '#202020' }}
            >
                <PixelCanvas
                    grid={currentGrid}
                    width={width}
                    height={height}
                    palette={palette}
                    gridSize={{ w: 8, h: 8 }}
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
