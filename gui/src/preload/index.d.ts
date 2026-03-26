import { ElectronAPI } from '@electron-toolkit/preload'

interface RecentProject {
  name: string
  path: string
  lastOpenedAt: string
}

interface ProjectActionResponse {
  ok: boolean
  canceled: boolean
  message: string
  project?: RecentProject
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      openSpriteEditorWindow: () => void
      pickProjectParentDirectory: () => Promise<string | null>
      createProject: (parentDirectory: string, projectName: string) => Promise<ProjectActionResponse>
      openProjectFromDialog: () => Promise<ProjectActionResponse>
      loadRecentProject: (projectPath: string) => Promise<ProjectActionResponse>
      getRecentProjects: () => Promise<RecentProject[]>
    }
  }
}
