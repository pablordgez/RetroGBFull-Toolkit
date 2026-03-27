import { useState, useCallback, useRef } from 'react';
import { Command } from './Command';

const disposeCommands = (commands: Command[]) => {
    commands.forEach((command) => {
        void command.dispose?.();
    });
};

export const useHistory = (maxHistory: number = 50) => {
    // Uses command pattern
    const historyRef = useRef<Command[]>([]);
    // History index represents the current point in the history, which may not be the end of the array if we undid and didn't do any new action
    const indexRef = useRef(-1);
    const isApplyingRef = useRef(false);
    
    // We use this just to trigger re-renders
    const [, setTick] = useState(0);

    const record = useCallback((command: Command) => {
        const history = historyRef.current;
        const index = indexRef.current;

        // Discard history after the current index (deleting redo after undoing and doing a new action)
        const discardedCommands = history.slice(index + 1);
        const newHistory = history.slice(0, index + 1);
        newHistory.push(command);

        // Limit history size
        const trimmedCommands =
            newHistory.length > maxHistory ? newHistory.splice(0, newHistory.length - maxHistory) : [];

        disposeCommands([...discardedCommands, ...trimmedCommands]);

        historyRef.current = newHistory;
        indexRef.current = newHistory.length - 1;

        setTick(t => t + 1);
    }, [maxHistory]);

    const undo = useCallback(async () => {
        const index = indexRef.current;
        if (index < 0 || isApplyingRef.current) {
            return;
        }

        isApplyingRef.current = true;

        try {
            const command = historyRef.current[index];
            await command.undo();
            indexRef.current = index - 1;
            setTick(t => t + 1);
        } finally {
            isApplyingRef.current = false;
        }
    }, []);

    const redo = useCallback(async () => {
        const index = indexRef.current;
        const history = historyRef.current;

        if (index >= history.length - 1 || isApplyingRef.current) {
            return;
        }

        isApplyingRef.current = true;

        try {
            const command = history[index + 1];
            await command.redo();
            indexRef.current = index + 1;
            setTick(t => t + 1);
        } finally {
            isApplyingRef.current = false;
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
        isApplying: isApplyingRef.current,
        historyIndex,
        historyLength: history.length
    };
};
