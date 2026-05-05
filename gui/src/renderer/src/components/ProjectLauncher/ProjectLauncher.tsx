import { useEffect, useState } from 'react';
import '../style/SpriteEditor.css';
import './ProjectLauncher.css';
import type { GbdkToolchainStatus } from '../../../../shared/projectGbdk';

type StatusTone = 'success' | 'error' | 'info';

interface RecentProject {
    name: string;
    path: string;
    lastOpenedAt: string;
}

interface ProjectActionResponse {
    ok: boolean;
    canceled: boolean;
    message: string;
    project?: RecentProject;
}

interface StatusMessage {
    tone: StatusTone;
    text: string;
}

interface CreateProjectDraft {
    parentDirectory: string;
    projectName: string;
}

const GENERIC_ERROR_MESSAGES = {
    pickFolder: 'Something went wrong while opening the folder picker. Please try again.',
    create: 'Something went wrong while creating the project. Please try again.',
    open: 'Something went wrong while opening the project. Please try again.',
    recentList: 'Something went wrong while loading recent projects.'
} as const;

const formatLastOpened = (isoDate: string): string => {
    const parsedDate = new Date(isoDate);

    if (Number.isNaN(parsedDate.getTime())) {
        return 'Unknown activity';
    }

    return `Last opened ${parsedDate.toLocaleString()}`;
};

export const ProjectLauncher = () => {
    const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
    const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);
    const [createDraft, setCreateDraft] = useState<CreateProjectDraft | null>(null);
    const [isBusy, setIsBusy] = useState(false);
    const [gbdkStatus, setGbdkStatus] = useState<GbdkToolchainStatus | null>(null);
    const [isInstallingGbdk, setIsInstallingGbdk] = useState(false);

    const showError = (text: string) => {
        setStatusMessage({
            tone: 'error',
            text
        });
    };

    const loadRecentProjects = async (preferredProjectPath?: string | null) => {
        try {
            const projects = await window.api.getRecentProjects();

            setRecentProjects(projects);
            setSelectedProjectPath((currentSelectedPath) => {
                const nextSelectedPath = preferredProjectPath === undefined ? currentSelectedPath : preferredProjectPath;

                if (nextSelectedPath && projects.some((project) => project.path === nextSelectedPath)) {
                    return nextSelectedPath;
                }

                return null;
            });
        } catch (error) {
            console.error('[project-launcher] getRecentProjects failed', error);
            setRecentProjects([]);
            setSelectedProjectPath(null);
            showError(GENERIC_ERROR_MESSAGES.recentList);
        }
    };

    useEffect(() => {
        void loadRecentProjects();
    }, []);

    useEffect(() => {
        const loadGbdkStatus = async () => {
            try {
                setGbdkStatus(await window.api.getGbdkToolchainStatus());
            } catch (error) {
                console.error('[project-launcher] getGbdkToolchainStatus failed', error);
            }
        };

        void loadGbdkStatus();
    }, []);

    const applyActionResponse = async (response: ProjectActionResponse) => {
        if (response.canceled) {
            return;
        }

        setStatusMessage({
            tone: response.ok ? 'success' : 'error',
            text: response.message
        });

        if (response.ok) {
            await loadRecentProjects(response.project?.path ?? selectedProjectPath);
        }
    };

    const handleCreateClick = async () => {
        setIsBusy(true);

        try {
            const parentDirectory = await window.api.pickProjectParentDirectory();

            if (!parentDirectory) {
                return;
            }

            setCreateDraft({
                parentDirectory,
                projectName: 'NewProject'
            });
            setStatusMessage({
                tone: 'info',
                text: 'Choose a project name to finish creating the project.'
            });
        } catch (error) {
            console.error('[project-launcher] pickProjectParentDirectory failed', error);
            showError(GENERIC_ERROR_MESSAGES.pickFolder);
        } finally {
            setIsBusy(false);
        }
    };

    const handleCreateConfirm = async () => {
        if (!createDraft) {
            return;
        }

        const trimmedProjectName = createDraft.projectName.trim();

        if (trimmedProjectName.length === 0) {
            setStatusMessage({
                tone: 'error',
                text: 'Project name is required.'
            });
            return;
        }

        setIsBusy(true);

        try {
            const response = await window.api.createProject(createDraft.parentDirectory, trimmedProjectName);

            if (response.ok) {
                setCreateDraft(null);
            }

            await applyActionResponse(response);
        } catch (error) {
            console.error('[project-launcher] createProject failed', error);
            showError(GENERIC_ERROR_MESSAGES.create);
        } finally {
            setIsBusy(false);
        }
    };

    const handleOpenClick = async () => {
        setIsBusy(true);

        try {
            const response = await window.api.openProjectFromDialog();
            await applyActionResponse(response);
        } catch (error) {
            console.error('[project-launcher] openProjectFromDialog failed', error);
            showError(GENERIC_ERROR_MESSAGES.open);
        } finally {
            setIsBusy(false);
        }
    };

    const handleLoadProject = async (projectPath: string) => {
        if (!projectPath) {
            return;
        }

        setIsBusy(true);

        try {
            const response = await window.api.loadRecentProject(projectPath);
            await applyActionResponse(response);
        } catch (error) {
            console.error('[project-launcher] loadRecentProject failed', error);
            showError(GENERIC_ERROR_MESSAGES.open);
        } finally {
            setIsBusy(false);
        }
    };

    const handleLoadClick = async () => {
        if (!selectedProjectPath) {
            return;
        }

        await handleLoadProject(selectedProjectPath);
    };

    const handleInstallGbdk = async () => {
        setIsInstallingGbdk(true);

        try {
            const result = await window.api.installLatestGbdkToolchain();
            setGbdkStatus(result);
            setStatusMessage({
                tone: 'success',
                text: `Installed ${result.releaseTag} from ${result.assetName}.`
            });
        } catch (error) {
            console.error('[project-launcher] installLatestGbdkToolchain failed', error);
            showError(error instanceof Error ? error.message : 'Something went wrong while installing GBDK.');
        } finally {
            setIsInstallingGbdk(false);
        }
    };

    const selectedProject = recentProjects.find((project) => project.path === selectedProjectPath) ?? null;

    return (
        <div className="launcher-screen">
            <section className="launcher-panel launcher-panel--hero">
                <div className="launcher-brand">
                    <p className="launcher-eyebrow">RetroGBFull Toolkit</p>
                    <h1 className="launcher-title">PROJECTS</h1>
                </div>

                {statusMessage && (
                    <div className={`launcher-status launcher-status--${statusMessage.tone}`} role="status">
                        {statusMessage.text}
                    </div>
                )}

                <div className="launcher-action-group">
                    <button type="button" onClick={handleCreateClick} disabled={isBusy || isInstallingGbdk}>
                        Create
                    </button>
                    <button type="button" onClick={handleOpenClick} disabled={isBusy || isInstallingGbdk}>
                        Open...
                    </button>
                    <button
                        type="button"
                        onClick={handleLoadClick}
                        disabled={isBusy || isInstallingGbdk || !selectedProjectPath}
                    >
                        Load
                    </button>
                    <button type="button" onClick={handleInstallGbdk} disabled={isBusy || isInstallingGbdk}>
                        {isInstallingGbdk ? 'Installing GBDK...' : 'Install / Reinstall GBDK'}
                    </button>
                </div>

                {gbdkStatus && (
                    <div className={`launcher-gbdk-card${gbdkStatus.installed ? '' : ' launcher-gbdk-card--missing'}`}>
                        <p className="launcher-eyebrow">GBDK Toolchain</p>
                        <strong>{gbdkStatus.installed ? 'Ready' : 'Missing'}</strong>
                        <span>{gbdkStatus.installPath}</span>
                        {gbdkStatus.version && <span>Version {gbdkStatus.version}</span>}
                        {!gbdkStatus.installed && (
                            <button type="button" onClick={handleInstallGbdk} disabled={isBusy || isInstallingGbdk}>
                                {isInstallingGbdk ? 'Installing GBDK...' : 'Install GBDK'}
                            </button>
                        )}
                    </div>
                )}
            </section>

            <section className="launcher-panel launcher-panel--recent">
                <div className="launcher-section-header">
                    <div>
                        <p className="launcher-eyebrow">Recent Projects</p>
                        <h2>Quick Open</h2>
                    </div>
                    <span className="launcher-count">{recentProjects.length}</span>
                </div>

                <div className="launcher-recent-list" role="list">
                    {recentProjects.length === 0 && (
                        <div className="launcher-empty-state">
                            No recent projects yet. Create one or open a project folder to get started.
                        </div>
                    )}

                    {recentProjects.map((project) => {
                        const isSelected = selectedProjectPath === project.path;

                        return (
                            <button
                                key={project.path}
                                type="button"
                                className={`launcher-recent-item${isSelected ? ' selected' : ''}`}
                                aria-pressed={isSelected}
                                onClick={() => setSelectedProjectPath(project.path)}
                                onDoubleClick={() => {
                                    setSelectedProjectPath(project.path);
                                    void handleLoadProject(project.path);
                                }}
                            >
                                <span className="launcher-recent-name">{project.name}</span>
                                <span className="launcher-recent-path">{project.path}</span>
                                <span className="launcher-recent-meta">{formatLastOpened(project.lastOpenedAt)}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="launcher-selection-summary">
                    {selectedProject ? (
                        <>
                            <strong>Selected:</strong> {selectedProject.name}
                            <span>{selectedProject.path}</span>
                        </>
                    ) : (
                        'No project selected.'
                    )}
                </div>
            </section>

            {createDraft && (
                <div className="launcher-modal-backdrop">
                    <div className="launcher-modal">
                        <p className="launcher-eyebrow">Create Project</p>
                        <h2>New Workspace</h2>

                        <label className="launcher-field">
                            Project Name
                            <input
                                type="text"
                                value={createDraft.projectName}
                                onChange={(event) => {
                                    const nextProjectName = event.target.value;
                                    setCreateDraft((currentDraft) => {
                                        if (!currentDraft) {
                                            return currentDraft;
                                        }

                                        return {
                                            ...currentDraft,
                                            projectName: nextProjectName
                                        };
                                    });
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        void handleCreateConfirm();
                                    }
                                }}
                                autoFocus
                            />
                        </label>

                        <div className="launcher-location-card">
                            <span>Location</span>
                            <strong>{createDraft.parentDirectory}</strong>
                        </div>

                        <div className="launcher-modal-actions">
                            <button type="button" onClick={() => setCreateDraft(null)} disabled={isBusy}>
                                Cancel
                            </button>
                            <button type="button" onClick={handleCreateConfirm} disabled={isBusy}>
                                Create Project
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
