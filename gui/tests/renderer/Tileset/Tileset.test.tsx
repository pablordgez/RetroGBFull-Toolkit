import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Tileset, TilesetRef } from '../../../src/renderer/src/components/Tileset/Tileset';

describe('<Tileset />', () => {
    const getCells = () => document.querySelectorAll('.tileset-cell');

    it('renders initially with one placeholder (when allowAdd is true)', () => {
        render(<Tileset />);
        
        const cells = getCells();
        expect(cells).toHaveLength(1);
        expect(cells[0]).toHaveTextContent('+');
    });

    it('renders empty initially (when allowAdd is false)', () => {
        render(<Tileset allowAdd={false} />);
        
        const cells = getCells();
        expect(cells).toHaveLength(0);
    });

    it('Selection: clicking a tile triggers onSelectTile', () => {
        const onSelectMock = vi.fn();
        render(<Tileset onSelectTile={onSelectMock} />);
        
        const cell = getCells()[0];
        fireEvent.click(cell);

        expect(cell).toHaveClass('selected');
        expect(onSelectMock).toHaveBeenCalledWith(0);
    });

    it('Ref API: updateTile adds an image and extends the list', () => {
        const ref = React.createRef<TilesetRef>();
        render(<Tileset ref={ref} />);

        act(() => {
            ref.current?.updateTile(0, 'image-data-url');
        });

        const cells = getCells();
        expect(cells).toHaveLength(2);
        
        const img = cells[0].querySelector('img');
        expect(img).toHaveAttribute('src', 'image-data-url');
        expect(cells[1]).toHaveTextContent('+');
    });

    it('Ref API: getTileCount returns correct number', () => {
        const ref = React.createRef<TilesetRef>();
        render(<Tileset ref={ref} />);

        expect(ref.current?.getTileCount()).toBe(1);

        act(() => {
            ref.current?.updateTile(0, 'img1');
        });

        expect(ref.current?.getTileCount()).toBe(2);
    });

    it('Pagination: handles navigation correctly', () => {
        const ref = React.createRef<TilesetRef>();
        render(<Tileset ref={ref} />);
        
        act(() => {
            for (let i = 0; i < 15; i++) {
                ref.current?.updateTile(i, `img-${i}`);
            }
        });

        expect(screen.getByText('1 / 2')).toBeInTheDocument();
        expect(screen.getByTitle('Tile 0')).toBeInTheDocument();
        expect(screen.queryByTitle('Tile 11')).not.toBeInTheDocument();

        const nextBtn = screen.getByText('>');
        fireEvent.click(nextBtn);

        expect(screen.getByText('2 / 2')).toBeInTheDocument();
        expect(screen.getByTitle('Tile 11')).toBeInTheDocument();
        expect(screen.queryByTitle('Tile 0')).not.toBeInTheDocument();
    });

    it('Right Click: triggers onRemoveTile', () => {
        const onRemoveMock = vi.fn();
        const ref = React.createRef<TilesetRef>();
        
        render(<Tileset ref={ref} onRemoveTile={onRemoveMock} />);

        act(() => {
            ref.current?.updateTile(0, 'img-to-remove');
        });

        const tileToRemove = screen.getByTitle('Tile 0');
        
        fireEvent.contextMenu(tileToRemove);

        expect(onRemoveMock).toHaveBeenCalledWith(0);
    });

    it('Ref API: removeTile removes the item from the UI', () => {
        const ref = React.createRef<TilesetRef>();
        render(<Tileset ref={ref} />);

        act(() => {
            ref.current?.updateTile(0, 'A');
            ref.current?.updateTile(1, 'B');
        });
        expect(getCells()).toHaveLength(3);

        act(() => {
            ref.current?.removeTile(0);
        });

        const cells = getCells();
        expect(cells).toHaveLength(2);
        
        const firstImg = cells[0].querySelector('img');
        expect(firstImg).toHaveAttribute('src', 'B');
    });
});