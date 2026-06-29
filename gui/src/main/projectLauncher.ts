import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import { basename, dirname, join, resolve } from 'path';
import { copyBundledEngineCore } from './projectCode';
import { ProjectLauncherError, isValidProjectName } from './projectLauncherPrimitives';

export {
    ProjectLauncherError,
    getProjectLauncherErrorMessage,
    isValidProjectName
} from './projectLauncherPrimitives';

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

const RECENT_PROJECT_LIMIT = 10;

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

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

const isValidProjectJsonStructure = (value: unknown): boolean => {
    if (!isRecord(value)) {
        return false;
    }

    if (typeof value.name !== 'string' || value.name.trim().length === 0) {
        return false;
    }

    if (typeof value.createdAt !== 'string') {
        return false;
    }

    const startingScenePath = value.startingScenePath;
    if (!(startingScenePath === undefined || startingScenePath === null || typeof startingScenePath === 'string')) {
        return false;
    }

    const hasModernTags = isRecord(value.tags) && Array.isArray(value.tags.entries);
    const hasModernSaveData = isRecord(value.saveData) && Array.isArray(value.saveData.entries);
    const hasModernResources = isRecord(value.resources) && Array.isArray(value.resources.items);
    const hasModernStructure = hasModernTags && hasModernSaveData && hasModernResources;

    const hasLegacyResources = isRecord(value.resources)
        && (
            Array.isArray(value.resources.folders)
            || Array.isArray(value.resources.items)
        );

    return hasModernStructure || hasLegacyResources;
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

    try {
        const rawProjectJson = await readFile(jsonPath, 'utf-8');
        const parsedProjectJson = JSON.parse(rawProjectJson);

        if (!isValidProjectJsonStructure(parsedProjectJson)) {
            return {
                isValid: false,
                name: projectName,
                path: resolvedPath,
                jsonPath,
                message: `The file "${projectName}.json" is not a valid project JSON file.`
            };
        }
    } catch {
        return {
            isValid: false,
            name: projectName,
            path: resolvedPath,
            jsonPath,
            message: `The file "${projectName}.json" is not valid JSON. Fix it and try opening the project again.`
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
