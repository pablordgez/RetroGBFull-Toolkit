import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    createProjectStructure,
    listRecentProjects,
    rememberRecentProject,
    validateProjectDirectory
} from '../../../src/main/projectLauncher';

const tempDirectories: string[] = [];

describe('projectLauncher integration', () => {
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
        expect(projectFileContents).toContain('"startingScenePath": null');
        expect(projectFileContents).toContain('"saveData"');
        expect(projectFileContents).toContain('"entries": []');
        expect(projectFileContents).toContain('"items": []');
    });

    it('returns a friendly message when trying to create a project that already exists', async () => {
        const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-launcher-'));
        tempDirectories.push(workspaceDirectory);

        await createProjectStructure(workspaceDirectory, 'MyProject');

        await expect(createProjectStructure(workspaceDirectory, 'MyProject')).rejects.toMatchObject({
            code: 'EEXIST'
        });

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

    it('rejects a project when the project JSON has invalid syntax', async () => {
        const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-launcher-'));
        tempDirectories.push(workspaceDirectory);

        const project = await createProjectStructure(workspaceDirectory, 'BrokenSyntax');
        await writeFile(join(project.path, 'BrokenSyntax.json'), '{ "name": "BrokenSyntax", ', 'utf-8');

        const validation = await validateProjectDirectory(project.path);

        expect(validation.isValid).toBe(false);
        expect(validation.message).toContain('not valid JSON');
    });

    it('rejects a project when the project JSON does not match project schema', async () => {
        const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-launcher-'));
        tempDirectories.push(workspaceDirectory);

        const project = await createProjectStructure(workspaceDirectory, 'BrokenShape');
        await writeFile(
            join(project.path, 'BrokenShape.json'),
            JSON.stringify({ name: 'BrokenShape', resources: {} }, null, 2),
            'utf-8'
        );

        const validation = await validateProjectDirectory(project.path);

        expect(validation.isValid).toBe(false);
        expect(validation.message).toContain('not a valid project JSON file');
    });
});
