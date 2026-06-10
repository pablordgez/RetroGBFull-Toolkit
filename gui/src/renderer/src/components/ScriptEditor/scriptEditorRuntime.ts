import * as monaco from 'monaco-editor'
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createMessageConnection,
  type MessageConnection
} from 'vscode-jsonrpc/browser'
import {
  CompletionItemKind as LspCompletionItemKind,
  CompletionRequest,
  CompletionTriggerKind as LspCompletionTriggerKind,
  DidChangeTextDocumentNotification,
  DidCloseTextDocumentNotification,
  DidOpenTextDocumentNotification,
  ExitNotification,
  InitializeRequest,
  InitializedNotification,
  type CompletionItem,
  type CompletionList,
  type CompletionParams,
  type Diagnostic,
  type DiagnosticSeverity,
  type InitializeResult,
  type MarkupContent,
  type ParameterInformation,
  type Position,
  type PublishDiagnosticsParams,
  type Range,
  type SignatureHelp,
  type SignatureHelpParams,
  type TextDocumentItem,
  PublishDiagnosticsNotification,
  ShutdownRequest,
  SignatureHelpRequest,
  SignatureHelpTriggerKind as LspSignatureHelpTriggerKind,
  WorkspaceFoldersRequest
} from 'vscode-languageserver-protocol'
import {
  PROJECT_CODE_WORKSPACE_ROOT,
  toProjectCodeWorkspacePath,
  toProjectCodeWorkspaceUri,
  type ProjectCodeWorkspaceSnapshot
} from '../../../../shared/projectCodeWorkspace'
import clangdWorkerFactory from './clangd/clangdWorker?worker'
import type {
  ClangdWorkerInboundMessage,
  ClangdWorkerOutboundMessage
} from './clangd/clangdMessages'
import { shouldSkipBlankCompletionRequest } from './scriptEditorCompletionPolicy'

type ScriptEditorTab = 'source' | 'header'
const SCRIPT_EDITOR_LANGUAGE_IDS = ['c', 'cpp'] as const

interface ScriptEditorRuntimeOptions {
  workspaceSnapshot: ProjectCodeWorkspaceSnapshot
  sourcePath: string
  managedSourcePrefix: string
  editableSourceContent: string
  headerPath: string
  headerContent: string
  activeTab: ScriptEditorTab
}

export interface ScriptEditorRuntimeSession {
  setActiveTab: (tab: ScriptEditorTab) => void
  updateSourceContent: (editableSourceContent: string) => void
  updateHeaderContent: (headerContent: string) => void
  dispose: () => Promise<void>
}

interface RuntimeDocument {
  kind: ScriptEditorTab
  resourcePath: string
  uri: string
  prefixLineCount: number
  version: number
  getText: () => string
}

interface RuntimeDocumentContext {
  session: RuntimeSession
  document: RuntimeDocument
}

interface RuntimeSession {
  connection: MessageConnection
  worker: Worker
  documents: Record<ScriptEditorTab, RuntimeDocument>
  diagnosticsByUri: Map<string, Diagnostic[]>
  pendingSyncTimers: Map<ScriptEditorTab, number>
  pendingSyncPromises: Map<ScriptEditorTab, Promise<void>>
  documentRevisions: Record<ScriptEditorTab, number>
  syncedRevisions: Record<ScriptEditorTab, number>
}

const CLANGD_MARKER_OWNER = 'retrogbfull-clangd'
const COMPLETION_TRIGGER_CHARACTERS = ['.', '>', ':', '"', '#', '/']
const SIGNATURE_TRIGGER_CHARACTERS = ['(', ',']
const CLANGD_SYNC_DEBOUNCE_MS = 40

let providersInstalled = false
const documentContexts = new Map<string, RuntimeDocumentContext>()

const countManagedPrefixLines = (managedSourcePrefix: string): number => {
  if (!managedSourcePrefix) {
    return 0
  }

  return Math.max(0, managedSourcePrefix.split('\n').length - 1)
}

const CLANGD_STARTUP_TIMEOUT_MS = 30_000

const startClangdWorker = async (
  workspaceSnapshot: ProjectCodeWorkspaceSnapshot
): Promise<{
  worker: Worker
  connectionPort: MessagePort
}> => {
  const worker = new clangdWorkerFactory()
  const messageChannel = new MessageChannel()

  await new Promise<void>((resolve, reject) => {
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const settle = (action: () => void): void => {
      if (settled) {
        return
      }

      settled = true
      worker.removeEventListener('message', handleMessage)
      worker.removeEventListener('error', handleError)

      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }

      action()
    }

    const handleMessage = (event: MessageEvent<ClangdWorkerOutboundMessage>): void => {
      if (event.data.type === 'ready') {
        settle(() => resolve())
        return
      }

      settle(() =>
        reject(
          new Error(
            event.data.type === 'error'
              ? event.data.message
              : 'Unexpected worker message'
          )
        )
      )
    }

    const handleError = (event: ErrorEvent): void => {
      settle(() =>
        reject(
          new Error(
            `clangd worker failed to load: ${event.message || 'unknown worker error'}`
          )
        )
      )
    }

    worker.addEventListener('message', handleMessage)
    worker.addEventListener('error', handleError)

    timeoutId = setTimeout(() => {
      settle(() =>
        reject(new Error('clangd worker did not respond within the startup timeout'))
      )
    }, CLANGD_STARTUP_TIMEOUT_MS)

    const payload: ClangdWorkerInboundMessage = {
      type: 'init',
      snapshot: workspaceSnapshot,
      lspPort: messageChannel.port2
    }

    worker.postMessage(payload, [messageChannel.port2])
  })

  return {
    worker,
    connectionPort: messageChannel.port1
  }
}

const toLspPosition = (
  position: monaco.Position,
  prefixLineCount: number
): Position => ({
  line: position.lineNumber - 1 + prefixLineCount,
  character: position.column - 1
})

const toMonacoRange = (
  range: Range,
  prefixLineCount: number
): monaco.IRange | null => {
  if (prefixLineCount > 0 && range.start.line < prefixLineCount) {
    return null
  }

  const startLineNumber = range.start.line + 1 - prefixLineCount
  const endLineNumber = range.end.line + 1 - prefixLineCount

  if (endLineNumber < 1) {
    return null
  }

  return {
    startLineNumber: Math.max(1, startLineNumber),
    startColumn: range.start.character + 1,
    endLineNumber: Math.max(1, endLineNumber),
    endColumn: range.end.character + 1
  }
}

const toMarkdownString = (value: string): monaco.IMarkdownString => ({
  value,
  isTrusted: false,
  supportThemeIcons: false
})

const stringifyMarkup = (
  documentation: string | MarkupContent | undefined | null
): string | monaco.IMarkdownString | undefined => {
  if (!documentation) {
    return undefined
  }

  if (typeof documentation === 'string') {
    return documentation
  }

  if (typeof documentation.value === 'string') {
    return documentation.kind === 'markdown'
      ? toMarkdownString(documentation.value)
      : documentation.value
  }

  return undefined
}

const mapDiagnosticSeverity = (
  severity: DiagnosticSeverity | undefined
): monaco.MarkerSeverity => {
  switch (severity) {
    case 1:
      return monaco.MarkerSeverity.Error
    case 2:
      return monaco.MarkerSeverity.Warning
    case 3:
      return monaco.MarkerSeverity.Info
    case 4:
      return monaco.MarkerSeverity.Hint
    default:
      return monaco.MarkerSeverity.Error
  }
}

const mapCompletionKind = (
  kind: LspCompletionItemKind | undefined
): monaco.languages.CompletionItemKind => {
  switch (kind) {
    case LspCompletionItemKind.Text:
      return monaco.languages.CompletionItemKind.Text
    case LspCompletionItemKind.Method:
      return monaco.languages.CompletionItemKind.Method
    case LspCompletionItemKind.Function:
      return monaco.languages.CompletionItemKind.Function
    case LspCompletionItemKind.Constructor:
      return monaco.languages.CompletionItemKind.Constructor
    case LspCompletionItemKind.Field:
      return monaco.languages.CompletionItemKind.Field
    case LspCompletionItemKind.Variable:
      return monaco.languages.CompletionItemKind.Variable
    case LspCompletionItemKind.Class:
      return monaco.languages.CompletionItemKind.Class
    case LspCompletionItemKind.Interface:
      return monaco.languages.CompletionItemKind.Interface
    case LspCompletionItemKind.Module:
      return monaco.languages.CompletionItemKind.Module
    case LspCompletionItemKind.Property:
      return monaco.languages.CompletionItemKind.Property
    case LspCompletionItemKind.Unit:
      return monaco.languages.CompletionItemKind.Unit
    case LspCompletionItemKind.Value:
      return monaco.languages.CompletionItemKind.Value
    case LspCompletionItemKind.Enum:
      return monaco.languages.CompletionItemKind.Enum
    case LspCompletionItemKind.Keyword:
      return monaco.languages.CompletionItemKind.Keyword
    case LspCompletionItemKind.Snippet:
      return monaco.languages.CompletionItemKind.Snippet
    case LspCompletionItemKind.Color:
      return monaco.languages.CompletionItemKind.Color
    case LspCompletionItemKind.File:
      return monaco.languages.CompletionItemKind.File
    case LspCompletionItemKind.Reference:
      return monaco.languages.CompletionItemKind.Reference
    case LspCompletionItemKind.Folder:
      return monaco.languages.CompletionItemKind.Folder
    case LspCompletionItemKind.EnumMember:
      return monaco.languages.CompletionItemKind.EnumMember
    case LspCompletionItemKind.Constant:
      return monaco.languages.CompletionItemKind.Constant
    case LspCompletionItemKind.Struct:
      return monaco.languages.CompletionItemKind.Struct
    case LspCompletionItemKind.Event:
      return monaco.languages.CompletionItemKind.Event
    case LspCompletionItemKind.Operator:
      return monaco.languages.CompletionItemKind.Operator
    case LspCompletionItemKind.TypeParameter:
      return monaco.languages.CompletionItemKind.TypeParameter
    default:
      return monaco.languages.CompletionItemKind.Text
  }
}

const normalizeCompletionItems = (
  result: CompletionItem[] | CompletionList | null | undefined
): {
  items: CompletionItem[]
  isIncomplete: boolean
} => {
  if (!result) {
    return {
      items: [],
      isIncomplete: false
    }
  }

  if (Array.isArray(result)) {
    return {
      items: result,
      isIncomplete: false
    }
  }

  return {
    items: result.items ?? [],
    isIncomplete: result.isIncomplete ?? false
  }
}

const getCompletionRange = (
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  document: RuntimeDocument,
  item: CompletionItem
): monaco.IRange => {
  const textEdit = item.textEdit

  if (textEdit && 'range' in textEdit) {
    return (
      toMonacoRange(textEdit.range, document.prefixLineCount) ?? {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      }
    )
  }

  if (textEdit && 'insert' in textEdit) {
    return (
      toMonacoRange(textEdit.insert, document.prefixLineCount) ?? {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      }
    )
  }

  const word = model.getWordUntilPosition(position)
  return {
    startLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endLineNumber: position.lineNumber,
    endColumn: word.endColumn
  }
}

const convertCompletionItem = (
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  document: RuntimeDocument,
  item: CompletionItem
): monaco.languages.CompletionItem => {
  const insertText =
    item.textEdit && 'newText' in item.textEdit
      ? item.textEdit.newText
      : item.insertText ?? item.label

  return {
    label: item.label,
    kind: mapCompletionKind(item.kind),
    detail: item.detail,
    documentation: stringifyMarkup(item.documentation),
    insertText,
    insertTextRules:
      item.insertTextFormat === 2
        ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
        : monaco.languages.CompletionItemInsertTextRule.KeepWhitespace,
    range: getCompletionRange(model, position, document, item),
    filterText: item.filterText,
    sortText: item.sortText,
    preselect: item.preselect,
    commitCharacters: item.commitCharacters,
    additionalTextEdits: (item.additionalTextEdits ?? []).reduce<monaco.editor.ISingleEditOperation[]>(
      (edits, edit) => {
        const range = toMonacoRange(edit.range, document.prefixLineCount)

        if (!range) {
          return edits
        }

        edits.push({
          range,
          text: edit.newText
        })
        return edits
      },
      []
    )
  }
}

const formatParameterLabel = (
  label: ParameterInformation['label'],
  signatureLabel: string
): string => {
  if (typeof label === 'string') {
    return label
  }

  return signatureLabel.slice(label[0], label[1])
}

const applyDiagnosticsToModel = (
  uri: string,
  prefixLineCount: number,
  diagnostics: Diagnostic[]
): void => {
  const model = monaco.editor.getModel(monaco.Uri.parse(uri))

  if (!model) {
    return
  }

  const markers = diagnostics.reduce<monaco.editor.IMarkerData[]>((entries, diagnostic) => {
    const range = toMonacoRange(diagnostic.range, prefixLineCount)

    if (!range) {
      return entries
    }

    entries.push({
      ...range,
      severity: mapDiagnosticSeverity(diagnostic.severity),
      message: diagnostic.message,
      source: diagnostic.source,
      code:
        typeof diagnostic.code === 'string' || typeof diagnostic.code === 'number'
          ? String(diagnostic.code)
          : undefined
    })

    return entries
  }, [])

  monaco.editor.setModelMarkers(model, CLANGD_MARKER_OWNER, markers)
}

const getDocumentContext = (
  model: monaco.editor.ITextModel
): RuntimeDocumentContext | undefined => {
  return documentContexts.get(model.uri.toString())
}

const installProviders = (): void => {
  if (providersInstalled) {
    return
  }

  for (const languageId of SCRIPT_EDITOR_LANGUAGE_IDS) {
    monaco.languages.registerCompletionItemProvider(languageId, {
      triggerCharacters: COMPLETION_TRIGGER_CHARACTERS,
      async provideCompletionItems(model, position, context) {
        const documentContext = getDocumentContext(model)

        if (!documentContext) {
          return {
            suggestions: []
          }
        }

        try {
          if (
            shouldSkipBlankCompletionRequest(
              model.getValue(),
              context.triggerKind === monaco.languages.CompletionTriggerKind.TriggerCharacter
            )
          ) {
            return {
              suggestions: []
            }
          }

          await flushPendingDocumentSync(documentContext.session, documentContext.document.kind)

          const params: CompletionParams = {
            textDocument: {
              uri: documentContext.document.uri
            },
            position: toLspPosition(position, documentContext.document.prefixLineCount),
            context: {
              triggerKind:
                context.triggerKind === monaco.languages.CompletionTriggerKind.TriggerCharacter
                  ? LspCompletionTriggerKind.TriggerCharacter
                  : context.triggerKind ===
                        monaco.languages.CompletionTriggerKind.TriggerForIncompleteCompletions
                    ? LspCompletionTriggerKind.TriggerForIncompleteCompletions
                    : LspCompletionTriggerKind.Invoked,
              triggerCharacter: context.triggerCharacter
            }
          }

          const response = await documentContext.session.connection.sendRequest(
            CompletionRequest.type,
            params
          )
          const normalized = normalizeCompletionItems(response)

          return {
            suggestions: normalized.items.map((item) =>
              convertCompletionItem(model, position, documentContext.document, item)
            ),
            incomplete: normalized.isIncomplete
          }
        } catch (error) {
          console.error('[script-editor] completion request failed', error)
          return {
            suggestions: []
          }
        }
      }
    })

    monaco.languages.registerSignatureHelpProvider(languageId, {
      signatureHelpTriggerCharacters: SIGNATURE_TRIGGER_CHARACTERS,
      signatureHelpRetriggerCharacters: [','],
      async provideSignatureHelp(model, position, _token, context) {
        const documentContext = getDocumentContext(model)

        if (!documentContext) {
          return null
        }

        try {
          await flushPendingDocumentSync(documentContext.session, documentContext.document.kind)

          const params: SignatureHelpParams = {
            textDocument: {
              uri: documentContext.document.uri
            },
            position: toLspPosition(position, documentContext.document.prefixLineCount),
            context: {
              isRetrigger: context.isRetrigger ?? false,
              triggerCharacter: context.triggerCharacter,
              triggerKind:
                context.triggerKind === monaco.languages.SignatureHelpTriggerKind.TriggerCharacter
                  ? LspSignatureHelpTriggerKind.TriggerCharacter
                  : context.triggerKind === monaco.languages.SignatureHelpTriggerKind.ContentChange
                    ? LspSignatureHelpTriggerKind.ContentChange
                    : LspSignatureHelpTriggerKind.Invoked,
              activeSignatureHelp: undefined
            }
          }

          const response = (await documentContext.session.connection.sendRequest(
            SignatureHelpRequest.type,
            params
          )) as SignatureHelp | null

          if (!response) {
            return null
          }

          return {
            value: {
              activeParameter: response.activeParameter ?? 0,
              activeSignature: response.activeSignature ?? 0,
              signatures: response.signatures.map((signature) => ({
                label: signature.label,
                documentation: stringifyMarkup(signature.documentation),
                parameters:
                  signature.parameters?.map((parameter) => ({
                    label: formatParameterLabel(parameter.label, signature.label),
                    documentation: stringifyMarkup(parameter.documentation)
                  })) ?? []
              }))
            },
            dispose: () => undefined
          }
        } catch (error) {
          console.error('[script-editor] signature help request failed', error)
          return null
        }
      }
    })
  }

  providersInstalled = true
}

const registerServerHandlers = (session: RuntimeSession): void => {
  session.connection.onNotification(
    PublishDiagnosticsNotification.type,
    (params: PublishDiagnosticsParams) => {
      const diagnostics = params.diagnostics ?? []
      console.info(
        '[script-editor] received %d diagnostics for %s',
        diagnostics.length,
        params.uri
      )
      session.diagnosticsByUri.set(params.uri, diagnostics)

      const document = Object.values(session.documents).find((entry) => entry.uri === params.uri)

      if (!document) {
        return
      }

      applyDiagnosticsToModel(params.uri, document.prefixLineCount, diagnostics)
    }
  )

  session.connection.onRequest('workspace/configuration', () => [])
  session.connection.onRequest(WorkspaceFoldersRequest.type, () => [
    {
      uri: `file://${PROJECT_CODE_WORKSPACE_ROOT}`,
      name: 'workspace'
    }
  ])
  session.connection.onRequest('client/registerCapability', () => null)
  session.connection.onRequest('client/unregisterCapability', () => null)
  session.connection.onRequest('window/workDoneProgress/create', () => null)
  session.connection.onRequest('workspace/applyEdit', () => ({ applied: false }))
  session.connection.onRequest('window/showDocument', () => ({ success: false }))
  session.connection.onNotification(
    'window/logMessage',
    (params: { type?: number; message?: string } | undefined) => {
      console.info('[clangd:lsp] %s', params?.message ?? 'window/logMessage')
    }
  )
  session.connection.onNotification(
    'window/showMessage',
    (params: { type?: number; message?: string } | undefined) => {
      console.warn('[clangd:lsp] %s', params?.message ?? 'window/showMessage')
    }
  )
}

const initializeConnection = async (
  connection: MessageConnection,
  workspaceSnapshot: ProjectCodeWorkspaceSnapshot
): Promise<InitializeResult> => {
  console.info('[script-editor] sending initialize request')
  const result = (await connection.sendRequest(InitializeRequest.type, {
    processId: null,
    clientInfo: {
      name: 'RetroGBFull Toolkit',
      version: '1.0.0'
    },
    locale: 'en',
    rootUri: `file://${workspaceSnapshot.workspaceRoot}`,
    capabilities: {
      workspace: {
        configuration: true,
        workspaceFolders: true
      },
      textDocument: {
        synchronization: {
          didSave: false,
          dynamicRegistration: false,
          willSave: false,
          willSaveWaitUntil: false
        },
        completion: {
          dynamicRegistration: false,
          contextSupport: true,
          completionItem: {
            snippetSupport: true,
            documentationFormat: ['markdown', 'plaintext'],
            deprecatedSupport: true,
            preselectSupport: true,
            insertReplaceSupport: true,
            labelDetailsSupport: true
          }
        },
        signatureHelp: {
          dynamicRegistration: false,
          contextSupport: true,
          signatureInformation: {
            documentationFormat: ['markdown', 'plaintext'],
            parameterInformation: {
              labelOffsetSupport: true
            },
            activeParameterSupport: true
          }
        },
        publishDiagnostics: {
          relatedInformation: true,
          versionSupport: true,
          codeDescriptionSupport: true,
          dataSupport: true
        }
      }
    },
    workspaceFolders: [
      {
        uri: `file://${workspaceSnapshot.workspaceRoot}`,
        name: 'workspace'
      }
    ]
  })) as InitializeResult

  console.info('[script-editor] initialize response received')
  await connection.sendNotification(InitializedNotification.type, {})
  console.info('[script-editor] initialized notification sent')
  return result
}

const openTextDocument = async (
  connection: MessageConnection,
  document: RuntimeDocument
): Promise<void> => {
  const textDocument: TextDocumentItem = {
    uri: document.uri,
    languageId: 'c',
    version: document.version,
    text: document.getText()
  }

  await connection.sendNotification(DidOpenTextDocumentNotification.type, {
    textDocument
  })
}

const sendDocumentChange = async (
  session: RuntimeSession,
  document: RuntimeDocument
): Promise<void> => {
  document.version += 1
  session.worker.postMessage({
    type: 'replace-file',
    path: toProjectCodeWorkspacePath(document.resourcePath),
    content: document.getText()
  } satisfies ClangdWorkerInboundMessage)

  await session.connection.sendNotification(DidChangeTextDocumentNotification.type, {
    textDocument: {
      uri: document.uri,
      version: document.version
    },
    contentChanges: [
      {
        text: document.getText()
      }
    ]
  })
}

const needsDocumentSync = (session: RuntimeSession, tab: ScriptEditorTab): boolean => {
  return session.documentRevisions[tab] !== session.syncedRevisions[tab]
}

const performDocumentSync = async (
  session: RuntimeSession,
  tab: ScriptEditorTab,
  force = false
): Promise<void> => {
  const existingPromise = session.pendingSyncPromises.get(tab)

  if (existingPromise) {
    await existingPromise
  }

  if (!force && !needsDocumentSync(session, tab)) {
    return
  }

  const targetRevision = session.documentRevisions[tab]
  const syncPromise = (async () => {
    await sendDocumentChange(session, session.documents[tab])
    session.syncedRevisions[tab] = Math.max(session.syncedRevisions[tab], targetRevision)
  })()

  session.pendingSyncPromises.set(tab, syncPromise)

  try {
    await syncPromise
  } finally {
    if (session.pendingSyncPromises.get(tab) === syncPromise) {
      session.pendingSyncPromises.delete(tab)
    }
  }
}

const flushPendingDocumentSync = async (
  session: RuntimeSession,
  tab: ScriptEditorTab,
  force = false
): Promise<void> => {
  const existingTimer = session.pendingSyncTimers.get(tab)

  if (!existingTimer && !force) {
    return
  }

  if (existingTimer) {
    window.clearTimeout(existingTimer)
    session.pendingSyncTimers.delete(tab)
  }

  await performDocumentSync(session, tab, force)
}

const scheduleDocumentSync = (session: RuntimeSession, tab: ScriptEditorTab): void => {
  const existingTimer = session.pendingSyncTimers.get(tab)

  if (existingTimer) {
    window.clearTimeout(existingTimer)
  }

  const timerId = window.setTimeout(() => {
    session.pendingSyncTimers.delete(tab)
    void performDocumentSync(session, tab).catch((error) => {
      console.error('[script-editor] failed to sync clangd document', error)
    })
  }, CLANGD_SYNC_DEBOUNCE_MS)

  session.pendingSyncTimers.set(tab, timerId)
}

export const createScriptEditorRuntime = async (
  options: ScriptEditorRuntimeOptions
): Promise<ScriptEditorRuntimeSession> => {
  installProviders()

  let editableSourceContent = options.editableSourceContent
  let headerContent = options.headerContent
  let activeTab = options.activeTab

  const hiddenSourceLineCount = countManagedPrefixLines(options.managedSourcePrefix)

  console.info(
    '[script-editor] starting clangd worker (%d workspace files)',
    options.workspaceSnapshot.files.length
  )

  const { worker, connectionPort } = await startClangdWorker(options.workspaceSnapshot)

  console.info('[script-editor] clangd worker started, establishing LSP connection')

  connectionPort.start?.()
  const reader = new BrowserMessageReader(connectionPort)
  const writer = new BrowserMessageWriter(connectionPort)
  const connection = createMessageConnection(reader, writer)

  const session: RuntimeSession = {
    connection,
    worker,
    diagnosticsByUri: new Map(),
    pendingSyncTimers: new Map(),
    pendingSyncPromises: new Map(),
    documentRevisions: {
      source: 0,
      header: 0
    },
    syncedRevisions: {
      source: 0,
      header: 0
    },
    documents: {
      source: {
        kind: 'source',
        resourcePath: options.sourcePath,
        uri: toProjectCodeWorkspaceUri(options.sourcePath),
        prefixLineCount: hiddenSourceLineCount,
        version: 1,
        getText: () => `${options.managedSourcePrefix}${editableSourceContent}`
      },
      header: {
        kind: 'header',
        resourcePath: options.headerPath,
        uri: toProjectCodeWorkspaceUri(options.headerPath),
        prefixLineCount: 0,
        version: 1,
        getText: () => headerContent
      }
    }
  }

  registerServerHandlers(session)
  connection.onError((error) => {
    console.error('[script-editor] LSP connection error', error)
  })
  connection.onClose(() => {
    console.warn('[script-editor] LSP connection closed')
  })
  connection.listen()

  const initResult = await initializeConnection(connection, options.workspaceSnapshot)
  console.info(
    '[script-editor] LSP initialized, server: %s',
    initResult.serverInfo?.name ?? 'unknown'
  )

  await openTextDocument(connection, session.documents.source)
  await openTextDocument(connection, session.documents.header)
  await flushPendingDocumentSync(session, 'source', true)
  await flushPendingDocumentSync(session, 'header', true)

  documentContexts.set(session.documents.source.uri, {
    session,
    document: session.documents.source
  })
  documentContexts.set(session.documents.header.uri, {
    session,
    document: session.documents.header
  })

  console.info(
    '[script-editor] code intelligence ready (source: %s, header: %s)',
    session.documents.source.uri,
    session.documents.header.uri
  )

  const applyCurrentMarkers = (tab: ScriptEditorTab): void => {
    const document = session.documents[tab]
    applyDiagnosticsToModel(
      document.uri,
      document.prefixLineCount,
      session.diagnosticsByUri.get(document.uri) ?? []
    )
  }

  applyCurrentMarkers(activeTab)

  return {
    setActiveTab(tab) {
      activeTab = tab
      applyCurrentMarkers(tab)
    },
    updateSourceContent(nextEditableSourceContent) {
      editableSourceContent = nextEditableSourceContent
      session.documentRevisions.source += 1
      scheduleDocumentSync(session, 'source')

      if (activeTab === 'source') {
        applyCurrentMarkers('source')
      }
    },
    updateHeaderContent(nextHeaderContent) {
      headerContent = nextHeaderContent
      session.documentRevisions.header += 1
      scheduleDocumentSync(session, 'header')

      if (activeTab === 'header') {
        applyCurrentMarkers('header')
      }
    },
    async dispose() {
      session.pendingSyncTimers.forEach((timerId) => window.clearTimeout(timerId))
      await Promise.all([...session.pendingSyncPromises.values()].map((promise) => promise.catch(() => undefined)))
      documentContexts.delete(session.documents.source.uri)
      documentContexts.delete(session.documents.header.uri)

      for (const document of Object.values(session.documents)) {
        const model = monaco.editor.getModel(monaco.Uri.parse(document.uri))

        if (model) {
          monaco.editor.setModelMarkers(model, CLANGD_MARKER_OWNER, [])
        }
      }

      try {
        await connection.sendNotification(DidCloseTextDocumentNotification.type, {
          textDocument: {
            uri: session.documents.source.uri
          }
        })
        await connection.sendNotification(DidCloseTextDocumentNotification.type, {
          textDocument: {
            uri: session.documents.header.uri
          }
        })
        await connection.sendRequest(ShutdownRequest.type)
        await connection.sendNotification(ExitNotification.type)
      } catch (error) {
        console.warn('[script-editor] clangd shutdown reported an error', error)
      } finally {
        connection.dispose()
        worker.postMessage({
          type: 'dispose'
        } satisfies ClangdWorkerInboundMessage)
        worker.terminate()
      }
    }
  }
}
