import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import { basename, dirname, join, resolve } from 'path';
import { copyBundledEngineCore } from './projectCode';

export interface RecentProject {
    name: string;
    path: string;
    lastOpenedAt: string;
}

export interface ProjectValidationResult {
    isValid: boolean;
    name: string;
    path: string;
    jsonPath: string;
    message?: string;
}

export class ProjectLauncherError extends Error {
    readonly userMessage: string;

    constructor(userMessage: string) {
        super(userMessage);
        this.name = 'ProjectLauncherError';
        this.userMessage = userMessage;
    }
}

type ProjectAction = 'create' | 'open' | 'recent-list';

interface ErrnoLike {
    code?: string;
}

const RECENT_PROJECT_LIMIT = 10;
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

// not empty, not reserved name, no reserved characters, can't end with space or dot
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

const normalizeProjectPath = (projectPath: string): string => resolve(projectPath);

const getProjectJsonPath = (projectPath: string): string => {
    const projectName = basename(projectPath);
    return join(projectPath, `${projectName}.json`);
};

const buildProjectFileContents = (projectName: string): string => {
    return `${JSON.stringify({
        name: projectName,
        createdAt: new Date().toISOString(),
        startingScenePath: null,
        tags: {
            entries: []
        },
        saveData: {
            entries: []
        },
        resources: {
            items: []
        }
    }, null, 2)}\n`;
};

const isRecentProject = (value: unknown): value is RecentProject => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const project = value as Record<string, unknown>;
    return typeof project.name === 'string'
        && typeof project.path === 'string'
        && typeof project.lastOpenedAt === 'string';
};

// must be a directory containing a .json file with the same name as the directory
export const validateProjectDirectory = async (projectPath: string): Promise<ProjectValidationResult> => {
    const resolvedPath = normalizeProjectPath(projectPath);
    const projectName = basename(resolvedPath);
    const jsonPath = getProjectJsonPath(resolvedPath);

    try {
        const directoryStat = await stat(resolvedPath);

        if (!directoryStat.isDirectory()) {
            return {
                isValid: false,
                name: projectName,
                path: resolvedPath,
                jsonPath,
                message: 'The selected path is not a project folder.'
            };
        }
    } catch {
        return {
            isValid: false,
            name: projectName,
            path: resolvedPath,
            jsonPath,
            message: 'The selected folder does not exist.'
        };
    }

    try {
        const fileStat = await stat(jsonPath);

        if (!fileStat.isFile()) {
            return {
                isValid: false,
                name: projectName,
                path: resolvedPath,
                jsonPath,
                message: `Expected "${projectName}.json" inside the selected folder.`
            };
        }
    } catch {
        return {
            isValid: false,
            name: projectName,
            path: resolvedPath,
            jsonPath,
            message: `Expected "${projectName}.json" inside the selected folder.`
        };
    }

    return {
        isValid: true,
        name: projectName,
        path: resolvedPath,
        jsonPath
    };
};

// basic project structure: folder with project name, .json file with basic project info and copy engine core
export const createProjectStructure = async (parentDirectory: string, projectName: string): Promise<RecentProject> => {
    const trimmedName = projectName.trim();

    if (!isValidProjectName(trimmedName)) {
        throw new ProjectLauncherError(
            'Please enter a valid project name. Avoid empty names and reserved filename characters.'
        );
    }

    const resolvedParentDirectory = resolve(parentDirectory);
    const targetDirectory = join(resolvedParentDirectory, trimmedName);
    const projectFilePath = join(targetDirectory, `${trimmedName}.json`);

    await mkdir(targetDirectory, { recursive: false });
    await writeFile(projectFilePath, buildProjectFileContents(trimmedName), 'utf-8');
    await copyBundledEngineCore(targetDirectory);

    return {
        name: trimmedName,
        path: targetDirectory,
        lastOpenedAt: new Date().toISOString()
    };
};

export const readRecentProjects = async (storePath: string): Promise<RecentProject[]> => {
    try {
        const rawContent = await readFile(storePath, 'utf-8');
        const parsed = JSON.parse(rawContent);

        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.filter(isRecentProject);
    } catch {
        return [];
    }
};

const writeRecentProjects = async (storePath: string, projects: RecentProject[]): Promise<void> => {
    await mkdir(dirname(storePath), { recursive: true });
    await writeFile(storePath, `${JSON.stringify(projects, null, 2)}\n`, 'utf-8');
};

export const listRecentProjects = async (storePath: string): Promise<RecentProject[]> => {
    const storedProjects = await readRecentProjects(storePath);
    const validProjects: RecentProject[] = [];

    for (const project of storedProjects) {
        const validation = await validateProjectDirectory(project.path);

        if (validation.isValid) {
            validProjects.push({
                ...project,
                name: validation.name,
                path: validation.path
            });
        }
    }

    // also checks if any stored projects were invalid and rewrites without them
    if (validProjects.length !== storedProjects.length) {
        await writeRecentProjects(storePath, validProjects);
    }

    return validProjects
        .sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt))
        .slice(0, RECENT_PROJECT_LIMIT);
};

export const rememberRecentProject = async (storePath: string, projectPath: string): Promise<RecentProject> => {
    const validation = await validateProjectDirectory(projectPath);

    if (!validation.isValid) {
        throw new ProjectLauncherError(validation.message ?? 'The selected folder is not a valid project.');
    }

    const recentProject: RecentProject = {
        name: validation.name,
        path: validation.path,
        lastOpenedAt: new Date().toISOString()
    };

    const storedProjects = await readRecentProjects(storePath);
    // takes all projects except the one being added
    const remainingProjects = storedProjects.filter((project) => resolve(project.path) !== recentProject.path);
    // adds the new project to the start of the list and limits the total number of stored projects
    const nextProjects = [recentProject, ...remainingProjects].slice(0, RECENT_PROJECT_LIMIT);

    await writeRecentProjects(storePath, nextProjects);

    return recentProject;
};
