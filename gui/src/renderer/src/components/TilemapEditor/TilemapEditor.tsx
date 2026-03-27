import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import '../style/SpriteEditor.css';
import { PixelCanvas } from '../PixelEditor/PixelCanvas';
import { useViewport } from '../hooks/viewport/useViewport';
import { Tileset, TilesetRef } from '../Tileset/Tileset';
import { useHistory } from '../hooks/history/useHistory';
import { useUndoRedoShortcuts } from '../hooks/history/useUndoRedoShortcuts';
import { useProjectAssetEditor } from '../hooks/useProjectAssetEditor';
import { floodFill } from '../utils/pixelAlgorithms';
import { applyGridChanges, resizeGrid } from '../utils/gridUtils';
import { EditorClosePrompt } from '../ProjectAssets/EditorClosePrompt';
import { renderTileToDataURL } from '../utils/imageUtils';
import {
    TilemapAssetDocument,
    TilesetAssetDocument,
    getProjectAssetDisplayName
} from '../../../../shared/projectAssets';

const DEFAULT_MAP_W = 20;
const DEFAULT_MAP_H = 18;

interface TilesetOption {
    name: string;
    path: string;
}

interface AppliedTilesetState {
    tilesetPath: string | null;
    tilesetImages: (string | null)[];
    tilesetTileCount: number;
    grid: number[];
    selectedTileIndex: number;
}

export const TilemapEditor = () => {
    const [mapWidth, setMapWidth] = useState(DEFAULT_MAP_W);
    const [mapHeight, setMapHeight] = useState(DEFAULT_MAP_H);
    
    const [grid, setGrid] = useState<number[]>(new Array(DEFAULT_MAP_W * DEFAULT_MAP_H).fill(0));
    
    const [tilesetPath, setTilesetPath] = useState<string | null>(null);
    const [tilesetImages, setTilesetImages] = useState<(string | null)[]>([]);
    const [tilesetTileCount, setTilesetTileCount] = useState(0);
    const [selectedTileIndex, setSelectedTileIndex] = useState(0);
    const [tool, setTool] = useState<'brush' | 'fill'>('brush');
    
    const [inputSize, setInputSize] = useState({ w: DEFAULT_MAP_W.toString(), h: DEFAULT_MAP_H.toString() });
    const [isTilesetPickerOpen, setIsTilesetPickerOpen] = useState(false);
    const [isTilesetPickerLoading, setIsTilesetPickerLoading] = useState(false);
    const [isTilesetSelectionRequired, setIsTilesetSelectionRequired] = useState(false);
    const [tilesetPickerError, setTilesetPickerError] = useState<string | null>(null);
    const [tilesetOptions, setTilesetOptions] = useState<TilesetOption[]>([]);
    const [isSwitchingTileset, setIsSwitchingTileset] = useState(false);

    const tilesetRef = useRef<TilesetRef>(null);

    const { 
        viewportSize, scale, pan, 
        containerRef, fitToScreen, handleZoom, handlePan
    } = useViewport(mapWidth, mapHeight);

    const { record, undo, redo, canUndo, canRedo } = useHistory();

    const assetDocument = useMemo((): TilemapAssetDocument => {
        return {
            kind: 'tilemap',
            version: 1,
            width: mapWidth,
            height: mapHeight,
            grid,
            tilesetPath,
            selectedTileIndex,
            tool
        };
    }, [grid, mapHeight, mapWidth, selectedTileIndex, tilesetPath, tool]);

    const applyDocument = useCallback((nextDocument: TilemapAssetDocument) => {
        setMapWidth(nextDocument.width);
        setMapHeight(nextDocument.height);
        setInputSize({
            w: nextDocument.width.toString(),
            h: nextDocument.height.toString()
        });
        setGrid(nextDocument.grid);
        setTilesetPath(nextDocument.tilesetPath);
        setSelectedTileIndex(nextDocument.selectedTileIndex);
        setTool(nextDocument.tool);
    }, []);

    const {
        assetPath,
        isClosePromptOpen,
        isDirty,
        isLoaded,
        isSaving,
        projectPath,
        saveAsset,
        statusMessage,
        setStatusMessage,
        handleCloseDecision
    } = useProjectAssetEditor({
        expectedKind: 'tilemap',
        document: assetDocument,
        applyDocument
    });

    useUndoRedoShortcuts(undo, redo);

    const buildTilesetImages = useCallback((tilesetDocument: TilesetAssetDocument): string[] => {
        return tilesetDocument.tiles.map((tile) => {
            return renderTileToDataURL(Uint8Array.from(tile), 8, 8, tilesetDocument.palette);
        });
    }, []);

    const applyTilesetState = useCallback((nextState: AppliedTilesetState) => {
        setTilesetPath(nextState.tilesetPath);
        setTilesetImages(nextState.tilesetImages);
        setTilesetTileCount(nextState.tilesetTileCount);
        setGrid(nextState.grid);
        setSelectedTileIndex(nextState.selectedTileIndex);
        setStatusMessage(null);
    }, [setStatusMessage]);

    const listTilesetOptions = useCallback(async (currentPath = ''): Promise<TilesetOption[]> => {
        if (!projectPath) {
            return [];
        }

        const resourceView = await window.api.getProjectResources(projectPath, currentPath);
        const localTilesets = resourceView.items
            .filter((resource): resource is typeof resource & { type: 'file'; resourceType: 'tileset' } => {
                return resource.type === 'file' && resource.resourceType === 'tileset';
            })
            .map((resource) => ({
                name: resource.name,
                path: resource.path
            }));

        const nestedTilesets = await Promise.all(
            resourceView.items
                .filter((resource): resource is typeof resource & { type: 'folder' } => resource.type === 'folder')
                .map((resource) => listTilesetOptions(resource.path))
        );

        return [...localTilesets, ...nestedTilesets.flat()].sort((left, right) => {
            return left.path.localeCompare(right.path);
        });
    }, [projectPath]);

    const openTilesetPicker = useCallback(async (isRequired: boolean) => {
        setIsTilesetPickerOpen(true);
        setIsTilesetSelectionRequired(isRequired);
        setIsTilesetPickerLoading(true);
        setTilesetPickerError(null);

        try {
            const nextTilesetOptions = await listTilesetOptions();
            setTilesetOptions(nextTilesetOptions);
        } catch (error) {
            console.error('[tilemap-editor] listTilesetOptions failed', error);
            setTilesetPickerError(
                error instanceof Error
                    ? error.message
                    : 'Something went wrong while loading the available tilesets. Please try again.'
            );
        } finally {
            setIsTilesetPickerLoading(false);
        }
    }, [listTilesetOptions]);

    useEffect(() => {
        if (!tilesetPath) {
            setTilesetImages([]);
            setTilesetTileCount(0);
            return;
        }

        let isCancelled = false;

        const loadTileset = async () => {
            try {
                const payload = await window.api.loadProjectAssetFile(projectPath, tilesetPath);

                if (isCancelled) {
                    return;
                }

                if (payload.assetKind !== 'tileset') {
                    throw new Error('The selected tileset reference is not valid.');
                }

                const tilesetDocument = payload.document as TilesetAssetDocument;
                const nextTilesetImages = buildTilesetImages(tilesetDocument);
                const nextTileCount = tilesetDocument.tiles.length;

                setTilesetImages(nextTilesetImages);
                setTilesetTileCount(nextTileCount);

                if (nextTileCount > 0 && selectedTileIndex >= nextTileCount) {
                    setSelectedTileIndex(0);
                }
            } catch (error) {
                console.error('[tilemap-editor] loadProjectAssetFile failed', error);
                setStatusMessage(
                    error instanceof Error
                        ? error.message
                        : 'Something went wrong while loading the selected tileset. Please try again.'
                );
                setTilesetImages([]);
                setTilesetTileCount(0);
            }
        };

        void loadTileset();

        return () => {
            isCancelled = true;
        };
    }, [buildTilesetImages, projectPath, selectedTileIndex, setStatusMessage, tilesetPath]);

    useEffect(() => {
        tilesetImages.forEach((imageUrl, index) => {
            if (!imageUrl) {
                return;
            }

            tilesetRef.current?.updateTile(index, imageUrl);
        });
    }, [tilesetImages]);

    useEffect(() => {
        if (!isLoaded || !projectPath || tilesetPath || isTilesetPickerOpen) {
            return;
        }

        void openTilesetPicker(true);
    }, [isLoaded, isTilesetPickerOpen, openTilesetPicker, projectPath, tilesetPath]);

    const handleSelectTileset = useCallback(async (nextTilesetPath: string) => {
        if (!projectPath) {
            return;
        }

        setIsSwitchingTileset(true);

        try {
            const payload = await window.api.loadProjectAssetFile(projectPath, nextTilesetPath);

            if (payload.assetKind !== 'tileset') {
                throw new Error('The selected asset is not a tileset.');
            }

            const nextTilesetDocument = payload.document as TilesetAssetDocument;
            const nextTilesetImages = buildTilesetImages(nextTilesetDocument);
            const nextTileCount = nextTilesetDocument.tiles.length;
            const nextGrid = grid.map((tileIndex) => {
                return tileIndex >= 0 && tileIndex < nextTileCount ? tileIndex : 0;
            });
            const nextSelectedTileIndex =
                nextTileCount > 0 && selectedTileIndex >= 0 && selectedTileIndex < nextTileCount
                    ? selectedTileIndex
                    : 0;

            const previousState: AppliedTilesetState = {
                tilesetPath,
                tilesetImages,
                tilesetTileCount,
                grid: [...grid],
                selectedTileIndex
            };
            const nextState: AppliedTilesetState = {
                tilesetPath: nextTilesetPath,
                tilesetImages: nextTilesetImages,
                tilesetTileCount: nextTileCount,
                grid: nextGrid,
                selectedTileIndex: nextSelectedTileIndex
            };

            if (
                previousState.tilesetPath !== nextState.tilesetPath
                || previousState.selectedTileIndex !== nextState.selectedTileIndex
                || previousState.grid.some((value, index) => value !== nextState.grid[index])
            ) {
                record({
                    undo: () => {
                        applyTilesetState(previousState);
                    },
                    redo: () => {
                        applyTilesetState(nextState);
                    }
                });
            }

            applyTilesetState(nextState);
            setIsTilesetPickerOpen(false);
            setIsTilesetSelectionRequired(false);
        } catch (error) {
            console.error('[tilemap-editor] handleSelectTileset failed', error);
            setTilesetPickerError(
                error instanceof Error
                    ? error.message
                    : 'Something went wrong while selecting the tileset. Please try again.'
            );
        } finally {
            setIsSwitchingTileset(false);
        }
    }, [applyTilesetState, buildTilesetImages, grid, projectPath, record, selectedTileIndex, tilesetImages, tilesetPath, tilesetTileCount]);

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

        if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight || tilesetTileCount <= 0) return;

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

    }, [mapWidth, mapHeight, record, selectedTileIndex, tilesetTileCount, tool, performFloodFill]);

    const activeTilesetLabel = tilesetPath
        ? getProjectAssetDisplayName(tilesetPath.split('/').pop() ?? 'Tileset')
        : 'No tileset selected';

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
                    {statusMessage && <div className="editor-status">{statusMessage}</div>}
                    <div className="button-row">
                        <button disabled={!canUndo} onClick={undo}>Undo</button>
                        <button disabled={!canRedo} onClick={redo}>Redo</button>
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

                <h3>Tileset</h3>
                <div className="toolbox">
                    <p className="editor-modal-copy tilemap-editor__tileset-label">{activeTilesetLabel}</p>
                    <div className="button-row" style={{ marginBottom: 0 }}>
                        <button
                            type="button"
                            onClick={() => {
                                void openTilesetPicker(false);
                            }}
                            disabled={isSwitchingTileset || isSaving}
                        >
                            {tilesetPath ? 'Select Tileset' : 'Choose Tileset'}
                        </button>
                    </div>
                </div>
                <div className="toolbox" style={{ flex: '1 0 auto', display: 'flex', flexDirection: 'column' }}>
                    <Tileset 
                        key={`${tilesetPath ?? 'no-tileset'}:${tilesetTileCount}`}
                        ref={tilesetRef}
                        onSelectTile={setSelectedTileIndex}
                        selectedIndex={selectedTileIndex}
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

            {isClosePromptOpen && (
                <EditorClosePrompt
                    assetLabel={getProjectAssetDisplayName(assetPath.split('/').pop() ?? 'Tilemap')}
                    isBusy={isSaving}
                    onCloseDecision={(decision) => {
                        void handleCloseDecision(decision);
                    }}
                />
            )}

            {isTilesetPickerOpen && (
                <div className="editor-modal-backdrop">
                    <div className="editor-modal" role="dialog" aria-modal="true">
                        <h2>{isTilesetSelectionRequired ? 'Choose A Tileset' : 'Select Tileset'}</h2>
                        <p className="editor-modal-copy">
                            {isTilesetSelectionRequired
                                ? 'This tilemap needs a tileset before you can edit it.'
                                : 'Choose which tileset this tilemap should use.'}
                        </p>

                        {tilesetPickerError && (
                            <div className="editor-status" style={{ marginTop: '16px', marginBottom: 0 }}>
                                {tilesetPickerError}
                            </div>
                        )}

                        <div className="tilemap-editor__tileset-list" role="list">
                            {isTilesetPickerLoading && (
                                <div className="tilemap-editor__tileset-option tilemap-editor__tileset-option--empty">
                                    Loading tilesets...
                                </div>
                            )}

                            {!isTilesetPickerLoading && tilesetOptions.length === 0 && (
                                <div className="tilemap-editor__tileset-option tilemap-editor__tileset-option--empty">
                                    No tilesets were found in this project yet.
                                </div>
                            )}

                            {!isTilesetPickerLoading && tilesetOptions.map((option) => (
                                <button
                                    key={option.path}
                                    type="button"
                                    className="tilemap-editor__tileset-option"
                                    onClick={() => {
                                        void handleSelectTileset(option.path);
                                    }}
                                    disabled={isSwitchingTileset}
                                >
                                    <span>{option.name}</span>
                                    <span className="tilemap-editor__tileset-path">{option.path}</span>
                                </button>
                            ))}
                        </div>

                        <div className="editor-modal-actions">
                            <button
                                type="button"
                                onClick={() => {
                                    void openTilesetPicker(isTilesetSelectionRequired);
                                }}
                                disabled={isTilesetPickerLoading || isSwitchingTileset}
                            >
                                Refresh
                            </button>
                            {!isTilesetSelectionRequired && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsTilesetPickerOpen(false);
                                        setTilesetPickerError(null);
                                    }}
                                    disabled={isSwitchingTileset}
                                >
                                    Cancel
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
