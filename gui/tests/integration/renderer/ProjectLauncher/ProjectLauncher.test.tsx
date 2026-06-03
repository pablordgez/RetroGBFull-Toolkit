import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectLauncher } from '../../../../src/renderer/src/components/ProjectLauncher/ProjectLauncher';

const recentProjects = [
    {
        name: 'Alpha',
        path: '/projects/Alpha',
        lastOpenedAt: '2026-03-26T09:00:00.000Z'
    },
    {
        name: 'Beta',
        path: '/projects/Beta',
        lastOpenedAt: '2026-03-25T09:00:00.000Z'
    }
];

describe('<ProjectLauncher />', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        vi.mocked(window.api.getRecentProjects).mockReset();
        vi.mocked(window.api.getRecentProjects).mockResolvedValue([]);
        vi.mocked(window.api.getRuntimePlatform).mockReset();
        vi.mocked(window.api.getRuntimePlatform).mockResolvedValue('win32');
        vi.mocked(window.api.getGbdkToolchainStatus).mockReset();
        vi.mocked(window.api.getGbdkToolchainStatus).mockResolvedValue({
            installed: true,
            installPath: '/toolchains/gbdk',
            executablePath: '/toolchains/gbdk/bin/lcc',
            version: null,
            source: 'development-root',
            message: 'GBDK is available at /toolchains/gbdk.'
        });
        vi.mocked(window.api.installLatestGbdkToolchain).mockReset();
        vi.mocked(window.api.getMakeToolchainStatus).mockReset();
        vi.mocked(window.api.getMakeToolchainStatus).mockResolvedValue({
            installed: true,
            installPath: '/toolchains/make',
            executablePath: '/toolchains/make/bin/make',
            version: '4.4.1',
            source: 'runtime-managed',
            message: 'GNU Make is available at /toolchains/make/bin/make.'
        });
        vi.mocked(window.api.installLatestMakeToolchain).mockReset();
        vi.mocked(window.api.pickProjectParentDirectory).mockReset();
        vi.mocked(window.api.pickProjectParentDirectory).mockResolvedValue(null);
        vi.mocked(window.api.createProject).mockReset();
        vi.mocked(window.api.openProjectFromDialog).mockReset();
        vi.mocked(window.api.loadRecentProject).mockReset();
    });

    it('keeps Load disabled until a recent project is selected', async () => {
        vi.mocked(window.api.getRecentProjects)
            .mockResolvedValueOnce(recentProjects)
            .mockResolvedValueOnce(recentProjects);
        vi.mocked(window.api.loadRecentProject).mockResolvedValue({
            ok: true,
            canceled: false,
            message: 'Open project stub invoked for "Alpha".',
            project: recentProjects[0]
        });

        render(<ProjectLauncher />);

        const loadButton = screen.getByRole('button', { name: 'Load' });
        expect(loadButton).toBeDisabled();

        const alphaProject = await screen.findByRole('button', { name: /Alpha/i });
        await userEvent.click(alphaProject);

        expect(loadButton).toBeEnabled();

        await userEvent.click(loadButton);

        await waitFor(() => {
            expect(window.api.loadRecentProject).toHaveBeenCalledWith('/projects/Alpha');
        });
    });

    it('opens the create modal after choosing a parent directory and submits the project name', async () => {
        const createdProject = {
            name: 'MyProject',
            path: '/workspace/MyProject',
            lastOpenedAt: '2026-03-26T10:00:00.000Z'
        };

        vi.mocked(window.api.pickProjectParentDirectory).mockResolvedValue('/workspace');
        vi.mocked(window.api.getRecentProjects)
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([createdProject]);
        vi.mocked(window.api.createProject).mockResolvedValue({
            ok: true,
            canceled: false,
            message: 'Open project stub invoked for "MyProject".',
            project: createdProject
        });

        render(<ProjectLauncher />);

        await userEvent.click(screen.getByRole('button', { name: 'Create' }));

        expect(await screen.findByRole('heading', { name: 'New Workspace' })).toBeInTheDocument();

        const nameInput = screen.getByLabelText('Project Name');
        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, 'MyProject');

        await userEvent.click(screen.getByRole('button', { name: 'Create Project' }));

        await waitFor(() => {
            expect(window.api.createProject).toHaveBeenCalledWith('/workspace', 'MyProject');
        });

        await waitFor(() => {
            expect(screen.queryByRole('heading', { name: 'New Workspace' })).not.toBeInTheDocument();
        });
    });

    it('shows validation feedback when opening a custom folder fails', async () => {
        vi.mocked(window.api.getRecentProjects).mockResolvedValue([]);
        vi.mocked(window.api.openProjectFromDialog).mockResolvedValue({
            ok: false,
            canceled: false,
            message: 'Expected "MyProject.json" inside the selected folder.'
        });

        render(<ProjectLauncher />);

        await userEvent.click(screen.getByRole('button', { name: 'Open...' }));

        expect(await screen.findByRole('status')).toHaveTextContent(
            'Expected "MyProject.json" inside the selected folder.'
        );
    });

    it('shows a generic error message if an unexpected launcher API error happens', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.mocked(window.api.getRecentProjects).mockResolvedValue([]);
        vi.mocked(window.api.openProjectFromDialog).mockRejectedValue(new Error('unexpected low-level failure'));

        render(<ProjectLauncher />);

        await userEvent.click(screen.getByRole('button', { name: 'Open...' }));

        expect(await screen.findByRole('status')).toHaveTextContent(
            'Something went wrong while opening the project. Please try again.'
        );
    });

    it('shows the missing GBDK card and installs from the launcher', async () => {
        vi.mocked(window.api.getGbdkToolchainStatus).mockResolvedValue({
            installed: false,
            installPath: '/toolchains/gbdk',
            executablePath: '/toolchains/gbdk/bin/lcc',
            version: null,
            source: 'runtime-managed',
            message: 'GBDK was not found at /toolchains/gbdk.'
        });
        vi.mocked(window.api.installLatestGbdkToolchain).mockResolvedValue({
            installed: true,
            installPath: '/toolchains/gbdk',
            executablePath: '/toolchains/gbdk/bin/lcc',
            version: 'gbdk-4.5.0',
            source: 'runtime-managed',
            message: 'Installed gbdk-4.5.0 to /toolchains/gbdk.',
            releaseTag: 'gbdk-4.5.0',
            assetName: 'gbdk-win64.zip',
            replacedExisting: false
        });

        render(<ProjectLauncher />);

        expect(await screen.findByText('Missing')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Install GBDK' }));

        await waitFor(() => {
            expect(window.api.installLatestGbdkToolchain).toHaveBeenCalledTimes(1);
        });
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Installed gbdk-4.5.0 from gbdk-win64.zip.'
        );
    });

    it('shows the missing GNU Make card and installs from the launcher', async () => {
        vi.mocked(window.api.getMakeToolchainStatus).mockResolvedValue({
            installed: false,
            installPath: '/toolchains/make',
            executablePath: '/toolchains/make/bin/make',
            version: null,
            source: 'runtime-managed',
            message: 'GNU Make was not found at /toolchains/make.'
        });
        vi.mocked(window.api.installLatestMakeToolchain).mockResolvedValue({
            installed: true,
            installPath: '/toolchains/make',
            executablePath: '/toolchains/make/bin/make',
            version: '4.4.1',
            source: 'runtime-managed',
            message: 'Installed GNU Make 4.4.1 to /toolchains/make.',
            releaseVersion: '4.4.1',
            archiveName: 'make-4.4.1.tar.gz',
            replacedExisting: false
        });

        render(<ProjectLauncher />);

        expect(await screen.findByText('GNU Make')).toBeInTheDocument();
        expect(await screen.findAllByText('Missing')).toHaveLength(1);

        await userEvent.click(screen.getByRole('button', { name: 'Try Install Anyway' }));

        await waitFor(() => {
            expect(window.api.installLatestMakeToolchain).toHaveBeenCalledTimes(1);
        });
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Installed GNU Make 4.4.1 from make-4.4.1.tar.gz.'
        );
    });

    it('opens the GNU Make setup guide after an install failure', async () => {
        vi.mocked(window.api.getMakeToolchainStatus).mockResolvedValue({
            installed: false,
            installPath: '/toolchains/make',
            executablePath: '/toolchains/make/bin/make',
            version: null,
            source: 'runtime-managed',
            message: 'GNU Make was not found at /toolchains/make.'
        });
        vi.mocked(window.api.installLatestMakeToolchain).mockRejectedValue(
            new Error('Automatic GNU Make installation requires additional dependencies.')
        );

        render(<ProjectLauncher />);

        expect(await screen.findByText('GNU Make')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Try Install Anyway' }));

        expect(await screen.findByRole('dialog', { name: 'GNU Make Setup Guide' })).toBeInTheDocument();
        expect(screen.getByText('winget install --id ezwinports.make -e')).toBeInTheDocument();
    });

    it('keeps the GNU Make setup guide open after Check Again finds GNU Make', async () => {
        vi.mocked(window.api.getMakeToolchainStatus)
            .mockResolvedValueOnce({
                installed: false,
                installPath: '/toolchains/make',
                executablePath: '/toolchains/make/bin/make',
                version: null,
                source: 'runtime-managed',
                message: 'GNU Make was not found at /toolchains/make.'
            })
            .mockResolvedValueOnce({
                installed: true,
                installPath: '/toolchains/make',
                executablePath: '/toolchains/make/bin/make',
                version: '4.4.1',
                source: 'runtime-managed',
                message: 'GNU Make is available at /toolchains/make/bin/make.'
            });

        render(<ProjectLauncher />);

        await userEvent.click(await screen.findByRole('button', { name: 'GNU Make Setup Guide' }));
        expect(await screen.findByRole('dialog', { name: 'GNU Make Setup Guide' })).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Check Again' }));

        const guideDialog = await screen.findByRole('dialog', { name: 'GNU Make Setup Guide' });
        expect(guideDialog).toBeInTheDocument();
        expect(await within(guideDialog).findByText('Ready')).toBeInTheDocument();
    });
});
