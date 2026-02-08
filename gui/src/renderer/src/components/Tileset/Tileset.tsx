import React, { useState, forwardRef, useImperativeHandle } from 'react';
import './Tileset.css';

export interface TilesetRef {
    updateTile: (index: number, imageUrl: string) => void;
    removeTile: (index: number) => void;
    getTileCount: () => number;
}

interface TilesetProps {
    // Handlers passed as props
    onSelectTile?: (index: number) => void;
    onRemoveTile?: (index: number) => void;
    className?: string;
    allowAdd?: boolean;
}

const ITEMS_PER_PAGE = 10;
const MAX_TILES = 256;

export const Tileset = forwardRef<TilesetRef, TilesetProps>(({ onSelectTile, onRemoveTile, className, allowAdd = true }, ref) => {

    const [tiles, setTiles] = useState<(string | null)[]>(allowAdd ? [null] : []);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [page, setPage] = useState(0);

    // useImperativeHandle exposes methods to the parent component
    useImperativeHandle(ref, () => ({
        updateTile: (index: number, imageUrl: string) => {
            setTiles(prev => {
                const newTiles = [...prev];
                
                // Ensure the array is long enough to hold the new index
                while (newTiles.length <= index) {
                    newTiles.push(null);
                }

                // Sets the image URL for the tile
                newTiles[index] = imageUrl;

                // We add a new placeholder (unless we can't add more tiles) if we just filled the last one
                if (allowAdd && index === newTiles.length - 1 && newTiles.length < MAX_TILES) {
                    newTiles.push(null);
                }

                return newTiles;
            });
        },
        removeTile: (index: number) => {
             setTiles(prev => {
                 const newTiles = [...prev];
                 // Removes the tile and adds a placeholder if there are no tiles left
                 if (index >= 0 && index < newTiles.length) {
                     newTiles.splice(index, 1);
                     if (newTiles.length === 0) newTiles.push(null);
                 }
                 return newTiles;
             });
        },
        getTileCount: () => tiles.length
    }));

    const handleTileClick = (index: number) => {
        setSelectedIndex(index);
        if (onSelectTile) {
            onSelectTile(index);
        }
    };

    const handleRightClick = (e: React.MouseEvent, index: number) => {
        e.preventDefault();
        if (tiles[index] === null) return;
        
        if (onRemoveTile) {
            onRemoveTile(index);
        }
    };

    const totalPages = Math.ceil(tiles.length / ITEMS_PER_PAGE);
    const startIndex = page * ITEMS_PER_PAGE;

    // Gets the tiles visible on the current page
    // Creates an array with the length of the items in the page and applies a map function
    const visibleCells = Array.from({ length: ITEMS_PER_PAGE }).map((_, i) => {
        // For each index within the page, it adds it to the index where the page starts to get the index of the tile
        const globalIndex = startIndex + i;
        if (globalIndex >= tiles.length) return null;
        // Stores the index and the content of the tile in the array 
        return {
            index: globalIndex,
            content: tiles[globalIndex]
        };
    })
    .filter(item => item !== null) as { index: number, content: string | null }[];

    return (
        <div className={`tileset-container ${className || ''}`}>

            <div className="tileset-grid">
                {visibleCells.map(({ index, content }) => (
                    <div 
                        key={index}
                        className={`tileset-cell ${selectedIndex === index ? 'selected' : ''}`}
                        onClick={() => handleTileClick(index)}
                        onContextMenu={(e) => { if(allowAdd) handleRightClick(e, index) }}
                        title={`Tile ${index}`}
                    >
                        {content ? (
                            <img src={content} alt={`Tile ${index}`} draggable={false} />
                        ) : (
                           allowAdd ? <div className="tileset-placeholder">+</div> : null
                        )}
                    </div>
                ))}
                {Array.from({ length: ITEMS_PER_PAGE - visibleCells.length }).map((_, i) => (
                    <div key={`empty-${i}`} style={{ width: '32px', height: '32px', border: '1px dashed #333', opacity: 0.3 }} />
                ))}
            </div>

            <div className="tileset-controls">
                <button 
                    className="tileset-nav-btn" 
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                >
                    &lt;
                </button>
                <span>{page + 1} / {Math.max(1, totalPages)}</span>
                <button 
                    className="tileset-nav-btn" 
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                >
                    &gt;
                </button>
            </div>
        </div>
    );
});

Tileset.displayName = 'Tileset';
