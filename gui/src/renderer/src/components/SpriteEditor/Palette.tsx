import React from 'react';

interface PaletteProps {
    colors: string[]; 
    selectedColor: number;
    onSelect: (colorIndex: number) => void;
    onReorder: (newColors: string[]) => void; 
    showTransparentIndexHint?: boolean;
}

export const Palette: React.FC<PaletteProps> = ({
    colors,
    selectedColor,
    onSelect,
    onReorder,
    showTransparentIndexHint = true
}) => {

    // When we start dragging we register the index of the color being dragged in the event's dataTransfer object
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        e.dataTransfer.setData('text/plain', index.toString());
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

    // When dropping
    const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetIndex: number) => {
        e.preventDefault();
        // We get the index of the color being dragged from the event's dataTransfer object
        const sourceIndexStr = e.dataTransfer.getData('text/plain');
        const sourceIndex = parseInt(sourceIndexStr, 10);

        if (isNaN(sourceIndex) || sourceIndex === targetIndex) return;


        const newColors = [...colors];
        // Removes the color being dragged and assigns it to movedColor (array destructuring makes it so that movedColor is not an array)
        const [movedColor] = newColors.splice(sourceIndex, 1);
        // Inserts the moved color in the new position
        newColors.splice(targetIndex, 0, movedColor);

        onReorder(newColors);
        
    };

    return (
        <div className="toolbox">
            <h3>Palette</h3>
            <div className="palette-row">
                {colors.map((color, index) => (
                    <div
                        key={`${color}-${index}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, index)}
                        onClick={() => onSelect(index)}
                        className="palette-swatch"
                        style={{
                            backgroundColor: color,
                            border: selectedColor === index ? '4px solid #9a2257' : '2px solid #0f380f',
                            boxShadow: selectedColor === index ? '0 0 8px rgba(0,0,0,0.5)' : 'none',
                            transform: selectedColor === index ? 'scale(1.1)' : 'scale(1)',
                            cursor: 'grab'
                        }}
                        title={`Index ${index} (Drag to reorder)`}
                    />
                ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '0.8em', opacity: 0.7 }}>
                Drag to reorder.
                {showTransparentIndexHint && (
                    <>
                        <br/>Index 0 is transparent.
                    </>
                )}
            </div>
        </div>
    );
};
