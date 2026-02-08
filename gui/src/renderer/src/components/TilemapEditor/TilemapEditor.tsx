import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import '../style/SpriteEditor.css';
import { PixelCanvas } from '../PixelEditor/PixelCanvas';
import { useViewport } from '../hooks/viewport/useViewport';
import { Tileset, TilesetRef } from '../Tileset/Tileset';
import { useHistory } from '../hooks/history/useHistory';
import { floodFill } from '../utils/pixelAlgorithms';
import { Tilemap } from './Tilemap';
import { applyGridChanges, resizeGrid } from '../utils/gridUtils';

const DEFAULT_MAP_W = 20;
const DEFAULT_MAP_H = 18;
const TILE_SIZE = { w: 8, h: 8 };

export const TilemapEditor = () => {
    const [mapWidth, setMapWidth] = useState(DEFAULT_MAP_W);
    const [mapHeight, setMapHeight] = useState(DEFAULT_MAP_H);
    
    const [grid, setGrid] = useState<number[]>(new Array(DEFAULT_MAP_W * DEFAULT_MAP_H).fill(0));
    
    const [tilesetImages, setTilesetImages] = useState<(string | null)[]>([]);
    const [selectedTileIndex, setSelectedTileIndex] = useState(0);
    const [tool, setTool] = useState<'brush' | 'fill'>('brush');
    
    const [inputSize, setInputSize] = useState({ w: DEFAULT_MAP_W.toString(), h: DEFAULT_MAP_H.toString() });
    const [exportLabel, setExportLabel] = useState("EXPORT DATA");

    const tilesetRef = useRef<TilesetRef>(null);

    const { 
        viewportSize, scale, pan, 
        containerRef, fitToScreen, handleZoom, handlePan
    } = useViewport(mapWidth, mapHeight);

    const { record, undo, redo, canUndo, canRedo } = useHistory();

    // Placeholder tiles before integrating the tileset editor
    const createPatternTile = (type: number) => {
        const canvas = document.createElement('canvas');
        canvas.width = 8;
        canvas.height = 8;
        const ctx = canvas.getContext('2d');
        if(!ctx) return '';
        
        const c0 = '#9bbc0f';
        const c1 = '#8bac0f';
        const c2 = '#306230';
        const c3 = '#0f380f';

        ctx.fillStyle = c0;
        ctx.fillRect(0,0,8,8);

        if (type === 0) {
            ctx.fillStyle = c1;
            ctx.fillRect(0,0,8,8);
            ctx.fillStyle = c2;
            ctx.fillRect(1,1,1,2);
            ctx.fillRect(3,5,1,2);
            ctx.fillRect(6,2,1,2);
        } else if (type === 1) {
            ctx.fillStyle = c1;
            ctx.fillRect(0,0,8,4);
            ctx.fillStyle = c2;
            ctx.fillRect(0,3,8,1);
            ctx.fillRect(0,7,8,1);
            ctx.fillRect(3,0,1,3);
            ctx.fillRect(7,4,1,3);
        } else if (type === 2) {
            ctx.fillStyle = c0;
            ctx.fillRect(0,0,8,8);
            ctx.fillStyle = c1;
            ctx.fillRect(0,2,2,1); ctx.fillRect(3,1,2,1); ctx.fillRect(6,2,2,1);
            ctx.fillRect(0,5,2,1); ctx.fillRect(3,6,2,1); ctx.fillRect(6,5,2,1);
        } else if (type === 3) {
            ctx.fillStyle = c2;
            ctx.fillRect(0,0,8,8);
            ctx.fillStyle = c1;
            ctx.fillRect(1,1,6,6);
            ctx.fillStyle = c2;
            ctx.fillRect(2,2,4,4);
            ctx.fillStyle = c1;
            ctx.fillRect(2,2,1,1); ctx.fillRect(5,2,1,1);
            ctx.fillRect(3,3,2,2);
            ctx.fillRect(2,5,1,1); ctx.fillRect(5,5,1,1);
        } else if (type === 4) {
             ctx.fillStyle = c1;
             ctx.fillRect(0,0,8,8);
             ctx.fillStyle = c3;
             ctx.fillRect(1,1,6,6);
             ctx.fillStyle = c2;
             ctx.fillRect(2,2,4,4);
        } else {
            ctx.fillStyle = c0;
            ctx.fillRect(0,0,8,8);
            ctx.fillStyle = c3;
            ctx.fillRect(0,0,4,4);
            ctx.fillRect(4,4,4,4);
        }

        return canvas.toDataURL();
    }



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

    // Initializes with the placeholder tiles
    useEffect(() => {
        const images: string[] = [];
        for(let i=0; i<6; i++) {
            images.push(createPatternTile(i));
        }
        setTilesetImages(images);
        
        images.forEach((img, i) => {
            tilesetRef.current?.updateTile(i, img);
        });
    }, []);

    // Whenever the data changes we create a new tilemap object that will be used to export
    const tilemap = useMemo(() => {
        return new Tilemap(mapWidth, mapHeight, new Uint8Array(grid));
    }, [mapWidth, mapHeight, grid]);

    // The following are essentially the same as in the sprite editor, for explanations look there
    const handleExport = async () => {
        try {
            const encodedString = tilemap.encode();
            await navigator.clipboard.writeText(encodedString);
            setExportLabel("COPIED!");
            setTimeout(() => setExportLabel("EXPORT DATA"), 2000);
        } catch (error) {
            console.error("Export failed:", error);
            setExportLabel("ERROR!");
            setTimeout(() => setExportLabel("EXPORT DATA"), 2000);
        }
    };

    const performFloodFill = useCallback((x: number, y: number, targetTile: number) => {
        const startTile = grid[y * mapWidth + x];
        if (startTile === targetTile) return;

        const pixelsToFill = floodFill(
            x, y, mapWidth, mapHeight,
            (gx, gy) => grid[gy * mapWidth + gx],
        );

        if (pixelsToFill.length === 0) return;

        const changes = pixelsToFill.map(p => ({
            index: p.index,
            oldTile: grid[p.index],
            newTile: targetTile
        }));

        setGrid(prev => {
            const ops = pixelsToFill.map(p => ({ index: p.index, color: targetTile }));
            return applyGridChanges(prev, ops) as number[];
        });

        record({
            undo: () => {
                setGrid(g => {
                    const ops = changes.map(c => ({ index: c.index, color: c.oldTile }));
                    return applyGridChanges(g, ops) as number[];
                });
            },
            redo: () => {
                 setGrid(g => {
                    const ops = changes.map(c => ({ index: c.index, color: c.newTile }));
                    return applyGridChanges(g, ops) as number[];
                });
            }
        });

    }, [grid, mapWidth, mapHeight, record]);

    const isDrawingRef = useRef(false);
    const historyBufferRef = useRef<Map<number, number>>(new Map());

    const handleTileInput = useCallback((x: number, y: number, type: 'down' | 'move' | 'up' | 'leave', button: number) => {
        if (type === 'up' || type === 'leave') {
             if (isDrawingRef.current) {
                isDrawingRef.current = false;
                if (historyBufferRef.current.size > 0) {
                     const changes = Array.from(historyBufferRef.current.entries()).map(([i, oldT]) => ({
                         index: i,
                         oldTile: oldT,
                         newTile: (button === 2) ? 0 : selectedTileIndex
                     }));

                     record({
                         undo: () => {
                             setGrid(g => {
                                 const ng = [...g];
                                 changes.forEach(c => ng[c.index] = c.oldTile);
                                 return ng;
                             });
                         },
                         redo: () => {
                             setGrid(g => {
                                 const ng = [...g];
                                 changes.forEach(c => ng[c.index] = c.newTile);
                                 return ng;
                             });
                         }
                     });
                }
                historyBufferRef.current.clear();
             }
             return;
        }

        if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight) return;

        const targetTile = (button === 2) ? 0 : selectedTileIndex;

        if (tool === 'fill' && type === 'down') {
            performFloodFill(x, y, targetTile);
            return;
        }

        if (tool === 'fill') return;

        if (type === 'down') {
            isDrawingRef.current = true;
            historyBufferRef.current.clear();
        }

        if (isDrawingRef.current) {
             const index = y * mapWidth + x;
             setGrid(prev => {
                const currentTile = prev[index];
                if (currentTile !== targetTile) {
                    if (!historyBufferRef.current.has(index)) {
                        historyBufferRef.current.set(index, currentTile);
                    }
                    return applyGridChanges(prev, [{ index, color: targetTile }]) as number[];
                }
                return prev;
             });
        }

    }, [mapWidth, mapHeight, selectedTileIndex, record]);

    const handleResize = () => {
        const w = parseInt(inputSize.w);
        const h = parseInt(inputSize.h);
        if(!isNaN(w) && !isNaN(h) && (w !== mapWidth || h !== mapHeight)) {
            const prevW = mapWidth;
            const prevH = mapHeight;
            const prevGrid = [...grid];

            const newGridUint8 = resizeGrid(grid, mapWidth, mapHeight, w, h, 0);
            const newGrid = Array.from(newGridUint8);

            record({
                undo: () => {
                    setMapWidth(prevW);
                    setMapHeight(prevH);
                    setGrid(prevGrid);
                    setInputSize({ w: prevW.toString(), h: prevH.toString() });
                },
                redo: () => {
                    setMapWidth(w);
                    setMapHeight(h);
                    setGrid(newGrid);
                    setInputSize({ w: w.toString(), h: h.toString() });
                }
            });

            setMapWidth(w);
            setMapHeight(h);
            setGrid(newGrid);
            fitToScreen();
        }
    }

    return (
        <div className="main-layout">
            <div className="sidebar">
                <h3>Tilemap Editor</h3>
                
                <div className="toolbox">
                    <div className="input-row">
                        <label>W: <input 
                            value={inputSize.w} 
                            onChange={(e) => setInputSize({...inputSize, w: e.target.value})}
                            onBlur={handleResize}
                        /></label>
                        <label>H: <input 
                            value={inputSize.h} 
                            onChange={(e) => setInputSize({...inputSize, h: e.target.value})} 
                            onBlur={handleResize}
                        /></label>
                    </div>
                </div>

                <div className="toolbox">
                    <h3>Tools</h3>
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

                <div className="toolbox">
                    <h3>Misc</h3>
                    <div className="button-row">
                        <button disabled={!canUndo} onClick={undo}>Undo</button>
                        <button disabled={!canRedo} onClick={redo}>Redo</button>
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

                <h3>Tileset</h3>
                <div className="toolbox" style={{ flex: '1 0 auto', display: 'flex', flexDirection: 'column' }}>
                    <Tileset 
                        ref={tilesetRef}
                        onSelectTile={setSelectedTileIndex}
                        className="tilemap-tileset"
                        allowAdd={false}
                    />
                </div>
            </div>

            <div
                ref={containerRef}
                className="grid-container"
                style={{ overflow: 'hidden', backgroundColor: '#202020' }}
            >
                <PixelCanvas
                    grid={grid}
                    width={mapWidth}
                    height={mapHeight}
                    tileset={tilesetImages}
                    palette={[]}
                    viewportSize={viewportSize}
                    scale={scale}
                    pan={pan}
                    onPixelInput={handleTileInput}
                    onPan={handlePan}
                    onZoom={handleZoom}
                    gridColor="rgba(15, 56, 15, 0.3)"
                    eraserIndex={-1}
                />
            </div>
        </div>
    );
};
