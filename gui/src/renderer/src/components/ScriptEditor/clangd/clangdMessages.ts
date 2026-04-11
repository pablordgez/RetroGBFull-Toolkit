import type { ProjectCodeWorkspaceSnapshot } from '../../../../../shared/projectCodeWorkspace'

export interface ClangdWorkerInitMessage {
  type: 'init'
  snapshot: ProjectCodeWorkspaceSnapshot
  lspPort: MessagePort
}

export interface ClangdWorkerReplaceFileMessage {
  type: 'replace-file'
  path: string
  content: string
}

export interface ClangdWorkerDisposeMessage {
  type: 'dispose'
}

export type ClangdWorkerInboundMessage =
  | ClangdWorkerInitMessage
  | ClangdWorkerReplaceFileMessage
  | ClangdWorkerDisposeMessage

export interface ClangdWorkerReadyMessage {
  type: 'ready'
}

export interface ClangdWorkerErrorMessage {
  type: 'error'
  message: string
}

export type ClangdWorkerOutboundMessage = ClangdWorkerReadyMessage | ClangdWorkerErrorMessage
