import { useState, useCallback, useRef } from 'react';
import { Command } from './Command';

export const useHistory = (maxHistory: number = 50) => {
    // Uses command pattern
    const historyRef = useRef<Command[]>([]);
    // History index represents the current point in the history, which may not be the end of the array if we undid and didn't do any new action
    const indexRef = useRef(-1);
    
    // We use this just to trigger re-renders
    const [, setTick] = useState(0);

    const record = useCallback((command: Command) => {
        const history = historyRef.current;
        const index = indexRef.current;

        // Discard history after the current index (deleting redo after undoing and doing a new action)
        const newHistory = history.slice(0, index + 1);
        newHistory.push(command);

        // Limit history size
        if (newHistory.length > maxHistory) newHistory.shift();

        historyRef.current = newHistory;
        indexRef.current = newHistory.length - 1;

        setTick(t => t + 1);
    }, [maxHistory]);

    const undo = useCallback(() => {
        const index = indexRef.current;
        if (index >= 0) {
            const command = historyRef.current[index];
            command.undo();
            indexRef.current = index - 1;
            setTick(t => t + 1);
        }
    }, []);

    const redo = useCallback(() => {
        const index = indexRef.current;
        const history = historyRef.current;
        if (index < history.length - 1) {
            const command = history[index + 1];
            command.redo();
            indexRef.current = index + 1;
            setTick(t => t + 1);
        }
    }, []);

    const historyIndex = indexRef.current;
    const history = historyRef.current;

    const canUndo = historyIndex >= 0;
    const canRedo = historyIndex < history.length - 1;

    return {
        record,
        undo,
        redo,
        canUndo,
        canRedo,
        historyIndex,
        historyLength: history.length
    };
};
