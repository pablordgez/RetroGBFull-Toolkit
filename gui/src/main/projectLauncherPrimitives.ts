export class ProjectLauncherError extends Error {
    readonly userMessage: string;

    constructor(userMessage: string) {
        super(userMessage);
        this.name = 'ProjectLauncherError';
        this.userMessage = userMessage;
    }
}

export type ProjectAction = 'create' | 'open' | 'recent-list';

interface ErrnoLike {
    code?: string;
}

const WINDOWS_RESERVED_NAMES = new Set([
    'CON',
    'PRN',
    'AUX',
    'NUL',
    'COM1',
    'COM2',
    'COM3',
    'COM4',
    'COM5',
    'COM6',
    'COM7',
    'COM8',
    'COM9',
    'LPT1',
    'LPT2',
    'LPT3',
    'LPT4',
    'LPT5',
    'LPT6',
    'LPT7',
    'LPT8',
    'LPT9'
]);

// Not empty, not reserved, no reserved characters, cannot end with a dot after trimming.
export const isValidProjectName = (projectName: string): boolean => {
    const trimmedName = projectName.trim();

    if (trimmedName.length === 0 || trimmedName === '.' || trimmedName === '..') {
        return false;
    }

    if (/[<>:"/\\|?*\u0000-\u001F]/.test(trimmedName)) {
        return false;
    }

    if (/[. ]$/.test(trimmedName)) {
        return false;
    }

    return !WINDOWS_RESERVED_NAMES.has(trimmedName.toUpperCase());
};

export const getProjectLauncherErrorMessage = (error: unknown, action: ProjectAction): string => {
    if (error instanceof ProjectLauncherError) {
        return error.userMessage;
    }

    const errorCode = typeof error === 'object' && error !== null ? (error as ErrnoLike).code : undefined;

    switch (errorCode) {
        case 'EEXIST':
            return 'A project folder with that name already exists in the selected location. Choose a different name or location.';
        case 'EACCES':
        case 'EPERM':
            return 'This location cannot be accessed with the current permissions. Choose a different folder or check your permissions.';
        case 'ENOENT':
            return action === 'create'
                ? 'The selected location is no longer available. Please choose another folder and try again.'
                : 'The selected project location could not be found. Please choose the project folder again.';
        case 'ENOSPC':
            return action === 'create'
                ? 'There is not enough disk space to create the project.'
                : 'There is not enough disk space to complete this action.';
        default:
            if (action === 'create') {
                return 'Something went wrong while creating the project. Please try again.';
            }

            if (action === 'open') {
                return 'Something went wrong while opening the project. Please try again.';
            }

            return 'Something went wrong while loading recent projects.';
    }
};
