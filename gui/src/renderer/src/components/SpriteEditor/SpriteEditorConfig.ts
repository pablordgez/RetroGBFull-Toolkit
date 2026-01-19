export const GB_PALETTE = ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'];
export const ERASER_COLOR = GB_PALETTE[0];
export const BASE_100_PERCENT_SIZE = 20;

export const MAX_GB_WIDTH = 80;
export const MAX_GB_HEIGHT = 160;
export const MAX_HARDWARE_SPRITES = 40;
export const MAX_CANVAS_DIMENSION = 4096;

export type PaintAction = {
    type: 'PAINT';
    frameIndex: number;
    changes: { index: number; oldColor: string; newColor: string }[];
};

export type ResizeAction = {
    type: 'RESIZE';
    prev: { width: number; height: number; frames: string[][] };
    next: { width: number; height: number; frames: string[][] };
};

export type FrameAction = {
    type: 'FRAME_OP';
    prev: { frames: string[][]; currentFrame: number };
    next: { frames: string[][]; currentFrame: number };
};

export type HistoryAction = PaintAction | ResizeAction | FrameAction;