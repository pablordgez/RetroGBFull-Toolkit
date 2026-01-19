import React from 'react';

interface AnimationControlsProps {
    currentFrame: number;
    totalFrames: number;
    fps: number;
    isPlaying: boolean;
    onSetFrame: (frame: number) => void;
    onAddFrame: () => void;
    onDeleteFrame: () => void;
    onTogglePlay: () => void;
    onFpsChange: (fps: number) => void;
}

export const AnimationControls: React.FC<AnimationControlsProps> = ({
    currentFrame, totalFrames, fps, isPlaying,
    onSetFrame, onAddFrame, onDeleteFrame, onTogglePlay, onFpsChange
}) => (
    <div className="toolbox">
        <h3>Animation</h3>
        <div className="anim-controls-row">
            <button 
                className="anim-btn"
                onClick={() => onSetFrame(Math.max(0, currentFrame - 1))}
                disabled={currentFrame === 0 || isPlaying}
            >◀</button>
            <span className="frame-counter">{currentFrame + 1} / {totalFrames}</span>
            <button 
                className="anim-btn"
                onClick={() => onSetFrame(Math.min(totalFrames - 1, currentFrame + 1))}
                disabled={currentFrame === totalFrames - 1 || isPlaying}
            >▶</button>
        </div>
        
        <div className="anim-controls-row">
            <button className="anim-btn" onClick={onAddFrame} title="Add Frame">+</button>
            <button className="anim-btn" onClick={onDeleteFrame} disabled={totalFrames <= 1} title="Delete Frame">−</button>
        </div>

        <div className="anim-play-row">
             <button 
                className={`play-btn ${isPlaying ? 'active' : ''}`}
                onClick={onTogglePlay}
            >
                {isPlaying ? '■' : '►'}
            </button>
            <label className="fps-label">
                FPS:
                <input 
                    type="number" min="1" max="60" 
                    value={fps} 
                    onChange={(e) => onFpsChange(Number(e.target.value))}
                    className="fps-input"
                />
            </label>
        </div>
    </div>
);