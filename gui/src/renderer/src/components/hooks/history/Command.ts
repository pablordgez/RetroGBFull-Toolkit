export interface Command {
    undo: () => void | Promise<void>;
    redo: () => void | Promise<void>;
    dispose?: () => void | Promise<void>;
}
