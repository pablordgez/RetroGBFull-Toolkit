import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useViewport } from '../../../src/renderer/src/components/hooks/viewport/useViewport';

let resizeCallback: ((entries: any[]) => void) | undefined;
const observeMock = vi.fn();
const disconnectMock = vi.fn();

beforeAll(() => {
    global.ResizeObserver = class {
        constructor(cb: any) {
            resizeCallback = cb;
        }
        observe = observeMock;
        disconnect = disconnectMock;
        unobserve = vi.fn();
    } as any;
});

afterEach(() => {
    vi.clearAllMocks();
    resizeCallback = undefined;
});

describe('useViewport', () => {
    const CONTENT_W = 100;
    const CONTENT_H = 100;

    const simulateResize = (width: number, height: number) => {
        act(() => {
            if (resizeCallback) {
                resizeCallback([{ contentRect: { width, height } }]);
            } else {
                console.warn("ResizeObserver was not initialized!");
            }
        });
    };

    const renderViewportHook = (w: number, h: number) => {
        return renderHook(() => {
            const hookData = useViewport(w, h);
            if (!hookData.containerRef.current) {
                (hookData.containerRef as any).current = document.createElement('div');
            }
            return hookData;
        });
    };

    it('initializes with default values', () => {
        const { result } = renderViewportHook(CONTENT_W, CONTENT_H);

        expect(result.current.scale).toBe(1);
        expect(result.current.pan).toEqual({ x: 0, y: 0 });
        expect(result.current.viewportSize).toEqual({ w: 0, h: 0 });
    });

    it('updates viewport size when ResizeObserver triggers', () => {
        const { result } = renderViewportHook(CONTENT_W, CONTENT_H);

        simulateResize(500, 500);

        expect(result.current.viewportSize).toEqual({ w: 500, h: 500 });
    });

    it('performs autoFit when viewport size becomes available', () => {
        const { result } = renderViewportHook(CONTENT_W, CONTENT_H);
        
        simulateResize(540, 540); 
        
        expect(result.current.scale).toBe(5);
        expect(result.current.pan).toEqual({ x: 20, y: 20 });
    });

    it('handles panning correctly', () => {
        const { result } = renderViewportHook(CONTENT_W, CONTENT_H);
        
        act(() => {
            result.current.handlePan(50, -20);
        });

        expect(result.current.pan).toEqual({ x: 50, y: -20 });
    });

    it('handles zooming towards a specific point', () => {
        const { result } = renderViewportHook(CONTENT_W, CONTENT_H);

        act(() => {
            result.current.handleZoom(2, 100, 100);
        });

        expect(result.current.scale).toBe(2);
        expect(result.current.pan).toEqual({ x: -100, y: -100 });
    });
});