/// <reference lib="WebWorker" />

import { BrowserMessageWriter } from 'vscode-languageserver/browser.js'
import createClangdModule from '@clangd-wasm/core/dist/clangd.js'
import clangdMainScriptUrl from '@clangd-wasm/core/dist/clangd.js?url'
import clangdWasmUrl from '@clangd-wasm/core/dist/clangd.wasm?url'
import clangdPThreadWorkerUrl from '@clangd-wasm/core/dist/clangd.worker.js?url'
import type {
  ClangdWorkerInboundMessage,
  ClangdWorkerOutboundMessage
} from './clangdMessages'

declare const self: DedicatedWorkerGlobalScope

interface ClangdModuleInstance {
  FS: {
    mkdir: (path: string) => void
    writeFile: (path: string, content: string) => void
    unlink: (path: string) => void
    analyzePath: (path: string) => { exists: boolean }
  }
  messageBuf?: unknown[]
}

class LspMessageStream {
  readonly #textDecoder = new TextDecoder()
  #buffer: number[] = []

  pushByte(byte: number): string[] {
    if (byte === 0) {
      return []
    }

    this.#buffer.push(byte)
    const messages: string[] = []

    while (true) {
      const headerBoundary = this.#findHeaderBoundary()

      if (!headerBoundary) {
        break
      }

      const bytes = Uint8Array.from(this.#buffer)
      const headerText = this.#textDecoder.decode(bytes.subarray(0, headerBoundary.index))
      const contentLengthMatch = headerText.match(
        /(?:^|[\r\n])Content-Length:\s*(\d+)\s*(?:[\r\n]|$)/i
      )

      if (!contentLengthMatch) {
        this.#consume(headerBoundary.index + headerBoundary.separatorLength)
        continue
      }

      const contentLength = Number.parseInt(contentLengthMatch[1], 10)
      const bodyStart = headerBoundary.index + headerBoundary.separatorLength
      const messageEnd = bodyStart + contentLength

      if (this.#buffer.length < messageEnd) {
        break
      }

      const body = this.#textDecoder.decode(bytes.subarray(bodyStart, messageEnd))
      this.#consume(messageEnd)
      messages.push(body)
    }

    return messages
  }

  #consume(byteCount: number): void {
    this.#buffer = byteCount >= this.#buffer.length ? [] : this.#buffer.slice(byteCount)
  }

  #findHeaderBoundary(): { index: number; separatorLength: number } | null {
    for (let index = 0; index <= this.#buffer.length - 4; index += 1) {
      if (
        this.#buffer[index] === 13 &&
        this.#buffer[index + 1] === 10 &&
        this.#buffer[index + 2] === 13 &&
        this.#buffer[index + 3] === 10
      ) {
        return {
          index,
          separatorLength: 4
        }
      }
    }

    for (let index = 0; index <= this.#buffer.length - 2; index += 1) {
      if (this.#buffer[index] === 13 && this.#buffer[index + 1] === 13) {
        return {
          index,
          separatorLength: 2
        }
      }
    }

    for (let index = 0; index <= this.#buffer.length - 2; index += 1) {
      if (this.#buffer[index] === 10 && this.#buffer[index + 1] === 10) {
        return {
          index,
          separatorLength: 2
        }
      }
    }

    return null
  }
}

const createClangdStderrWriter = (): ((byte: number) => void) & { buffer: number[] } => {
  const textDecoder = new TextDecoder()
  const writer = ((byte: number) => {
    if (byte === 0 || byte === 13) {
      return
    }

    if (byte === 10) {
      if (writer.buffer.length === 0) {
        return
      }

      const line = textDecoder.decode(Uint8Array.from(writer.buffer)).trim()
      writer.buffer.length = 0

      if (line) {
        console.warn(`[clangd] ${line}`)
      }

      return
    }

    writer.buffer.push(byte)
  }) as ((byte: number) => void) & { buffer: number[] }

  writer.buffer = []
  return writer
}

const directoryPathOf = (filePath: string): string => {
  const separatorIndex = filePath.lastIndexOf('/')
  return separatorIndex <= 0 ? '/' : filePath.slice(0, separatorIndex)
}

const ensureDirectory = (fs: ClangdModuleInstance['FS'], directoryPath: string): void => {
  const segments = directoryPath.split('/').filter(Boolean)
  let currentPath = ''

  for (const segment of segments) {
    currentPath += `/${segment}`

    try {
      fs.mkdir(currentPath)
    } catch {
      // The directory already exists in the in-memory clangd filesystem.
    }
  }
}

const writeWorkspaceFile = (
  fs: ClangdModuleInstance['FS'],
  filePath: string,
  content: string
): void => {
  ensureDirectory(fs, directoryPathOf(filePath))

  if (fs.analyzePath(filePath).exists) {
    try {
      fs.unlink(filePath)
    } catch {
      // Overwriting is fine; older file contents can be discarded.
    }
  }

  fs.writeFile(filePath, content)
}

let moduleInstance: ClangdModuleInstance | null = null
let lspPort: MessagePort | null = null
let pendingFileWrites = new Map<string, string>()
let pendingProtocolMessages: unknown[] = []

const checkSharedArrayBufferSupport = (): void => {
  if (typeof SharedArrayBuffer === 'undefined') {
    throw new Error(
      'SharedArrayBuffer is not available. ' +
        'Cross-origin isolation headers (COOP/COEP) may be missing.'
    )
  }
}

const launchClangd = async (
  port: MessagePort,
  snapshot: Extract<ClangdWorkerInboundMessage, { type: 'init' }>['snapshot']
): Promise<void> => {
  checkSharedArrayBufferSupport()

  console.info(
    '[clangd-worker] starting clangd with %d workspace files',
    snapshot.files.length
  )

  const writer = new BrowserMessageWriter(port)
  const lspMessageStream = new LspMessageStream()
  const stderrWriter = createClangdStderrWriter()

  const moduleOptions: Record<string, unknown> = {
    arguments: [
      `--compile-commands-dir=${snapshot.workspaceRoot}`,
      '--header-insertion=never',
      '--pch-storage=memory'
    ],
    messageBuf: pendingProtocolMessages,
    thisProgram: '/usr/bin/clangd',
    mainScriptUrlOrBlob: clangdMainScriptUrl,
    stdout: (byte: number) => {
      for (const message of lspMessageStream.pushByte(byte)) {
        const parsedMessage = JSON.parse(message) as Record<string, unknown> & {
          method?: string
          id?: number | string
        }
        console.info(
          '[clangd-worker] forwarding LSP message (%s)',
          typeof parsedMessage.method === 'string'
            ? parsedMessage.method
            : parsedMessage.id !== undefined
              ? `response:${String(parsedMessage.id)}`
              : 'unknown'
        )
        writer.write(parsedMessage as never)
      }
    },
    stderr: stderrWriter,
    locateFile: (path: string) => {
      if (path.endsWith('.wasm')) {
        return clangdWasmUrl
      }

      if (path.endsWith('.worker.js')) {
        return clangdPThreadWorkerUrl
      }

      return path
    },
    preRun: () => {
      const moduleFs = (moduleOptions as unknown as Partial<ClangdModuleInstance>).FS

      if (!moduleFs) {
        console.warn('[clangd-worker] preRun: FS not available, skipping file writes')
        return
      }

      for (const file of snapshot.files) {
        writeWorkspaceFile(moduleFs, file.path, file.content)
      }
    },
    print: (chunk: string) => {
      const trimmedChunk = chunk.trim()

      if (trimmedChunk) {
        console.info('[clangd-worker] print fallback: %s', trimmedChunk)
      }
    },
    printErr: (chunk: string) => {
      const trimmedChunk = chunk.trim()

      if (trimmedChunk) {
        console.warn(`[clangd:fallback] ${trimmedChunk}`)
      }
    },
    onAbort: (reason: unknown) => {
      console.error('[clangd-worker] module aborted', reason)
      const payload: ClangdWorkerOutboundMessage = {
        type: 'error',
        message: reason instanceof Error ? reason.message : String(reason)
      }
      self.postMessage(payload)
    },
    onRuntimeInitialized: () => {
      console.info('[clangd-worker] WASM runtime initialized')
    }
  }

  const instance = (await createClangdModule(moduleOptions)) as ClangdModuleInstance

  moduleInstance = instance
  moduleInstance.messageBuf = pendingProtocolMessages

  for (const [filePath, content] of pendingFileWrites) {
    writeWorkspaceFile(instance.FS, filePath, content)
  }

  pendingFileWrites = new Map()

  console.info('[clangd-worker] clangd started successfully')

  const payload: ClangdWorkerOutboundMessage = {
    type: 'ready'
  }
  self.postMessage(payload)
}

self.onmessage = (event: MessageEvent<ClangdWorkerInboundMessage>) => {
  const message = event.data

  if (message.type === 'dispose') {
    lspPort?.close()
    self.close()
    return
  }

  if (message.type === 'replace-file') {
    pendingFileWrites.set(message.path, message.content)

    if (moduleInstance) {
      writeWorkspaceFile(moduleInstance.FS, message.path, message.content)
    }

    return
  }

  if (message.type !== 'init') {
    return
  }

  lspPort = message.lspPort
  lspPort.start?.()
  lspPort.addEventListener('message', (portEvent: MessageEvent<unknown>) => {
    pendingProtocolMessages.push(portEvent.data)
  })

  void launchClangd(message.lspPort, message.snapshot).catch((error) => {
    const payload: ClangdWorkerOutboundMessage = {
      type: 'error',
      message: error instanceof Error ? error.message : 'Failed to start clangd.'
    }
    self.postMessage(payload)
  })
}
