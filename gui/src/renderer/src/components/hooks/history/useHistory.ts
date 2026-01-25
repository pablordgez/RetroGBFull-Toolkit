import { useState, useCallback } from 'react';
import { Command } from './Command';

export const useHistory = (maxHistory: number = 50) => {
    const [history, setHistory] = useState<Command[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const record = useCallback((command: Command) => {
        setHistory(prev => {
            const newHistory = prev.slice(0, historyIndex + 1);
            newHistory.push(command);
            if (newHistory.length > maxHistory) newHistory.shift();
            return newHistory;
        });
        setHistoryIndex(prev => (history.length < maxHistory ? prev + 1 : maxHistory - 1));
    }, [historyIndex, history.length, maxHistory]);

    const undo = useCallback(() => {
        if (historyIndex >= 0) {
            const command = history[historyIndex];
            command.undo();
            setHistoryIndex(prev => prev - 1);
        }
    }, [history, historyIndex]);

    const redo = useCallback(() => {
        if (historyIndex < history.length - 1) {
            const command = history[historyIndex + 1];
            command.redo();
            setHistoryIndex(prev => prev + 1);
        }
    }, [history, historyIndex]);

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
