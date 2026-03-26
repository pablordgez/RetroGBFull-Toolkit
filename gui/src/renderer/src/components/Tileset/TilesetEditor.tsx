import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import '../style/SpriteEditor.css';
import { GB_PALETTE, ERASER_COLOR } from '../SpriteEditor/SpriteEditorConfig';
import { PixelCanvas } from '../PixelEditor/PixelCanvas';
import { useHistory } from '../hooks/history/useHistory';
import { useViewport } from '../hooks/viewport/useViewport';
import { usePixelDraw } from '../hooks/usePixelDraw';
import { Palette } from '../SpriteEditor/Palette';
import { Tileset, TilesetRef } from './Tileset';
import { Tileset as TilesetClass } from './TilesetModel';
import { Tile } from '../PixelEditor/Tile';
import { renderTileToDataURL } from '../utils/imageUtils';
import { applyGridChanges } from '../utils/gridUtils';

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

    // Whenever the data changes we create a new tileset object that will be used to export
    const tilesetObject = useMemo(() => {
        return new TilesetClass(tilesData.map(t => new Tile(t)));
    }, [tilesData]);

    // When painting we update the current tile's data, creating a new entry if the tile is new
    const onPaint = useCallback((ops: { index: number, color: number }[]) => {
        if (ops.length === 0) return;
        
        setTilesData(prev => {
            const newData = [...prev];
            if (!newData[selectedTileIndex]) {
                newData[selectedTileIndex] = new Uint8Array(width * height).fill(ERASER_COLOR);
            }
            
            newData[selectedTileIndex] = applyGridChanges(newData[selectedTileIndex], ops);

            
            return newData;
        });
    }, [selectedTileIndex, width, height]);

    // Executes when the tile data changes, updates the tile thumbnail in the tileset
    useEffect(() => {
        const grid = tilesData[selectedTileIndex];
        if (grid && tilesetRef.current) {
            const url = renderTileToDataURL(grid, width, height, palette);
            tilesetRef.current.updateTile(selectedTileIndex, url);
        }
    }, [tilesData, selectedTileIndex, palette, width, height]);

    const tilesDataRef = useRef(tilesData);
    useEffect(() => { tilesDataRef.current = tilesData; }, [tilesData]);

    // This updates all the tiles when data affecting all tiles changes
    // In order to modify tilesData we would need to add it to the dependencies
    // However refs don't need to be added as dependencies, so we use a ref (declared and updated above) that matches the tilesetData and that's what we use
    // in this effect and the one for updating the thumbnail when the current tile changes
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
        
        // For undoing or redoing paint operations we just save the changes and the selected tile
        record({
            undo: () => {
                setTilesData(prev => {
                    const newD = [...prev];
                    const ops = changeList.map(c => ({ index: c.index, color: c.oldColor }));
                    newD[tileIdx] = applyGridChanges(newD[tileIdx], ops);
                    return newD;
                });
                setSelectedTileIndex(tileIdx);
            },
            redo: () => {
                 setTilesData(prev => {
                    const newD = [...prev];
                    const ops = changeList.map(c => ({ index: c.index, color: c.newColor }));
                    newD[tileIdx] = applyGridChanges(newD[tileIdx], ops);
                    return newD;
                });
                setSelectedTileIndex(tileIdx);
            }
        });
    }, [selectedTileIndex, record]);

    const { 
        tool, setTool, 
        handleCanvasInput: handleCanvasInputInternal 
    } = usePixelDraw({
        width, height, currentGrid,
        onPaint,
        onRecordHistory
    });

    const handleCanvasInput = (x: number, y: number, type: 'down' | 'move' | 'up' | 'leave', button: number) => {
        handleCanvasInputInternal(x, y, type, button, selectedColor, ERASER_COLOR);
    };

    // When we select a tile, if the tile doesn't exist we create a new entry for it with the transparent color
    // Then we set the tile (new or not) as the selected tile
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

         // If the removed tile is the last one, the selected tile will be the new last tile, otherwise the tile that is now in the same index as the removed tile
         const newSelected = index >= newData.length ? Math.max(0, newData.length - 1) : index;

         setTilesData(newData);
         setSelectedTileIndex(newSelected);
         tilesetRef.current?.removeTile(index);

         
         record({
            // For undoing we restore the previous data and update the thumbnails
             undo: () => {
                 setTilesData(prevData);
                 setSelectedTileIndex(prevSelected);
                 prevData.forEach((grid, i) => {
                     const url = renderTileToDataURL(grid, width, height, palette);
                     tilesetRef.current?.updateTile(i, url);
                 });
             },
             // For redoing we set the new data
             // No need to update the thumbnails as the tiles are just shifted and if a placeholder needs to be added that is handled by removeTile 
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
