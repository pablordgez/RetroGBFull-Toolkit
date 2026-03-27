import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    createProjectStructure,
    getProjectLauncherErrorMessage,
    isValidProjectName,
    listRecentProjects,
    rememberRecentProject,
    validateProjectDirectory
} from '../../src/main/projectLauncher';

const tempDirectories: string[] = [];

describe('projectLauncher helpers', () => {
    afterEach(async () => {
        await Promise.all(
            tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
        );
    });

    it('creates the expected project folder and json file structure', async () => {
        const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-launcher-'));
        tempDirectories.push(workspaceDirectory);

        const project = await createProjectStructure(workspaceDirectory, 'MyProject');
        const validation = await validateProjectDirectory(project.path);
        const projectFileContents = await readFile(join(project.path, 'MyProject.json'), 'utf-8');

        expect(validation.isValid).toBe(true);
        expect(projectFileContents).toContain('"name": "MyProject"');
        expect(projectFileContents).toContain('"items": []');
    });

    it('returns a friendly message when trying to create a project that already exists', async () => {
        const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-launcher-'));
        tempDirectories.push(workspaceDirectory);

        await createProjectStructure(workspaceDirectory, 'MyProject');

        await expect(createProjectStructure(workspaceDirectory, 'MyProject')).rejects.toMatchObject({
            code: 'EEXIST'
        });

        expect(
            getProjectLauncherErrorMessage({ code: 'EEXIST' }, 'create')
        ).toBe('A project folder with that name already exists in the selected location. Choose a different name or location.');
    });

    it('rejects invalid project names that would break on Windows or Linux', () => {
        expect(isValidProjectName('')).toBe(false);
        expect(isValidProjectName('bad/name')).toBe(false);
        expect(isValidProjectName('CON')).toBe(false);
        expect(isValidProjectName('ValidProject')).toBe(true);
    });

    it('keeps only valid recent projects and moves reopened projects to the top', async () => {
        const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-launcher-'));
        tempDirectories.push(workspaceDirectory);

        const storePath = join(workspaceDirectory, 'recent-projects.json');
        const alpha = await createProjectStructure(workspaceDirectory, 'Alpha');
        const beta = await createProjectStructure(workspaceDirectory, 'Beta');

        await writeFile(
            storePath,
            JSON.stringify([
                {
                    name: 'Missing',
                    path: join(workspaceDirectory, 'Missing'),
                    lastOpenedAt: '2026-03-20T09:00:00.000Z'
                },
                beta,
                alpha
            ]),
            'utf-8'
        );

        await rememberRecentProject(storePath, alpha.path);
        const recentProjects = await listRecentProjects(storePath);

        expect(recentProjects.map((project) => project.name)).toEqual(['Alpha', 'Beta']);
    });

    it('falls back to a friendly generic message for unexpected errors', () => {
        expect(getProjectLauncherErrorMessage(new Error('raw internal failure'), 'create')).toBe(
            'Something went wrong while creating the project. Please try again.'
        );
        expect(getProjectLauncherErrorMessage(new Error('raw internal failure'), 'open')).toBe(
            'Something went wrong while opening the project. Please try again.'
        );
    });
});
