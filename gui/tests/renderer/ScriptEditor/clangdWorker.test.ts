import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@clangd-wasm/core/dist/clangd.js', () => ({
  default: vi.fn()
}))

vi.mock('@clangd-wasm/core/dist/clangd.js?url', () => ({
  default: '/mock/clangd.js'
}))

vi.mock('@clangd-wasm/core/dist/clangd.wasm?url', () => ({
  default: '/mock/clangd.wasm'
}))

vi.mock('@clangd-wasm/core/dist/clangd.worker.js?url', () => ({
  default: '/mock/clangd.worker.js'
}))

vi.mock('vscode-languageserver/browser.js', () => ({
  BrowserMessageWriter: vi.fn()
}))

import {
  LspMessageStream,
  checkSharedArrayBufferSupport,
  createClangdStderrWriter,
  directoryPathOf,
  registerClangdWorker,
  writeWorkspaceFile
} from '../../../src/renderer/src/components/ScriptEditor/clangd/clangdWorker'

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const encodeBytes = (text: string) => Array.from(new TextEncoder().encode(text))

const createMockFs = () => {
  const existingPaths = new Set<string>()

  return {
    existingPaths,
    mkdir: vi.fn(),
    writeFile: vi.fn((path: string, _content: string) => {
      existingPaths.add(path)
    }),
    unlink: vi.fn((path: string) => {
      existingPaths.delete(path)
    }),
    analyzePath: vi.fn((path: string) => ({
      exists: existingPaths.has(path)
    }))
  }
}

const createMockPort = () => {
  let messageHandler: ((event: MessageEvent<unknown>) => void) | undefined

  return {
    port: {
      start: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'message' && typeof listener === 'function') {
          messageHandler = listener as (event: MessageEvent<unknown>) => void
        }
      })
    } as unknown as MessagePort,
    emitMessage: (data: unknown) => {
      messageHandler?.({
        data
      } as MessageEvent<unknown>)
    }
  }
}

const createWorkerScope = () => ({
  close: vi.fn(),
  onmessage: null as ((event: MessageEvent<any>) => void) | null,
  postMessage: vi.fn()
})

describe('clangdWorker', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('parses LSP messages across CRLF and LF header boundaries', () => {
    const stream = new LspMessageStream()
    const request = JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialize'
    })
    const response = JSON.stringify({
      id: 7,
      jsonrpc: '2.0',
      result: {
        ok: true
      }
    })

    const framedMessages =
      `Content-Length: ${request.length}\r\n\r\n${request}\0` +
      `Content-Length: ${response.length}\n\n${response}`

    const bytes = encodeBytes(framedMessages)
    const parsedMessages = [
      ...bytes.slice(0, 12).flatMap((byte) => stream.pushByte(byte)),
      ...bytes.slice(12).flatMap((byte) => stream.pushByte(byte))
    ]

    expect(parsedMessages).toEqual([request, response])
  })

  it('buffers stderr lines and emits trimmed clangd warnings', () => {
    const writer = createClangdStderrWriter()

    for (const byte of encodeBytes('  first warning  \r\n\r\n')) {
      writer(byte)
    }

    expect(console.warn).toHaveBeenCalledWith('[clangd] first warning')
    expect(writer.buffer).toEqual([])
  })

  it('derives directory paths and rewrites workspace files safely', () => {
    const fs = createMockFs()
    fs.existingPaths.add('/workspace/src/game.c')

    expect(directoryPathOf('/workspace/src/game.c')).toBe('/workspace/src')
    expect(directoryPathOf('/game.c')).toBe('/')

    writeWorkspaceFile(fs, '/workspace/src/game.c', 'int game(void) { return 0; }')

    expect(fs.mkdir).toHaveBeenCalledWith('/workspace')
    expect(fs.mkdir).toHaveBeenCalledWith('/workspace/src')
    expect(fs.unlink).toHaveBeenCalledWith('/workspace/src/game.c')
    expect(fs.writeFile).toHaveBeenCalledWith('/workspace/src/game.c', 'int game(void) { return 0; }')
  })

  it('starts clangd, stages workspace files, and forwards framed LSP output', async () => {
    const workerScope = createWorkerScope()
    const { emitMessage, port } = createMockPort()
    const fs = createMockFs()
    const write = vi.fn()
    let capturedOptions: Record<string, unknown> | undefined

    class MockMessageWriter {
      constructor(_port: MessagePort) {}

      write = write
    }

    registerClangdWorker(workerScope, {
      MessageWriter: MockMessageWriter,
      createModule: vi.fn(async (options) => {
        capturedOptions = options
        Object.assign(options, {
          FS: fs
        })

        expect((options.locateFile as (path: string) => string)('clangd.wasm')).toBe(
          '/mock/clangd.wasm'
        )
        expect((options.locateFile as (path: string) => string)('clangd.worker.js')).toBe(
          '/mock/clangd.worker.js'
        )
        expect((options.locateFile as (path: string) => string)('clangd.data')).toBe('clangd.data')

        ;(options.preRun as () => void)()
        for (const byte of encodeBytes('stderr line\n')) {
          ;(options.stderr as (byte: number) => void)(byte)
        }
        ;(options.print as (chunk: string) => void)('  print fallback  ')
        ;(options.printErr as (chunk: string) => void)('  print error fallback  ')
        ;(options.onRuntimeInitialized as () => void)()

        return {
          FS: fs
        }
      }),
      mainScriptUrl: '/mock/clangd.js',
      pThreadWorkerUrl: '/mock/clangd.worker.js',
      wasmUrl: '/mock/clangd.wasm'
    })

    workerScope.onmessage?.({
      data: {
        type: 'replace-file',
        path: '/workspace/include/config.h',
        content: '#define ENABLED 1'
      }
    } as MessageEvent<any>)

    workerScope.onmessage?.({
      data: {
        type: 'init',
        lspPort: port,
        snapshot: {
          files: [
            {
              path: '/workspace/src/main.c',
              content: 'int main(void) { return 0; }'
            }
          ],
          sourceFileCount: 1,
          workspaceRoot: '/workspace'
        }
      }
    } as MessageEvent<any>)

    await flushMicrotasks()

    expect(port.start).toHaveBeenCalledTimes(1)
    expect(fs.writeFile).toHaveBeenCalledWith('/workspace/src/main.c', 'int main(void) { return 0; }')
    expect(fs.writeFile).toHaveBeenCalledWith('/workspace/include/config.h', '#define ENABLED 1')
    expect(workerScope.postMessage).toHaveBeenCalledWith({
      type: 'ready'
    })
    expect(console.warn).toHaveBeenCalledWith('[clangd] stderr line')
    expect(console.info).toHaveBeenCalledWith('[clangd-worker] print fallback: %s', 'print fallback')
    expect(console.warn).toHaveBeenCalledWith('[clangd:fallback] print error fallback')

    emitMessage({
      id: 1,
      method: 'initialize',
      jsonrpc: '2.0'
    })

    expect(capturedOptions?.messageBuf).toEqual([
      {
        id: 1,
        method: 'initialize',
        jsonrpc: '2.0'
      }
    ])

    const outboundMessage = JSON.stringify({
      jsonrpc: '2.0',
      method: 'textDocument/publishDiagnostics',
      params: {
        uri: 'file:///workspace/src/main.c'
      }
    })

    for (const byte of encodeBytes(`Content-Length: ${outboundMessage.length}\r\n\r\n${outboundMessage}`)) {
      ;(capturedOptions?.stdout as (byte: number) => void)(byte)
    }

    expect(write).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      method: 'textDocument/publishDiagnostics',
      params: {
        uri: 'file:///workspace/src/main.c'
      }
    })
  })

  it('rewrites files immediately after startup and disposes the worker port', async () => {
    const workerScope = createWorkerScope()
    const { port } = createMockPort()
    const fs = createMockFs()

    registerClangdWorker(workerScope, {
      MessageWriter: class {
        constructor(_port: MessagePort) {}

        write() {}
      },
      createModule: vi.fn(async (options) => {
        Object.assign(options, {
          FS: fs
        })
        ;(options.preRun as () => void)()

        return {
          FS: fs
        }
      }),
      mainScriptUrl: '/mock/clangd.js',
      pThreadWorkerUrl: '/mock/clangd.worker.js',
      wasmUrl: '/mock/clangd.wasm'
    })

    workerScope.onmessage?.({
      data: {
        type: 'init',
        lspPort: port,
        snapshot: {
          files: [],
          sourceFileCount: 0,
          workspaceRoot: '/workspace'
        }
      }
    } as MessageEvent<any>)

    await flushMicrotasks()

    workerScope.onmessage?.({
      data: {
        type: 'replace-file',
        path: '/workspace/src/player.c',
        content: 'int player = 1;'
      }
    } as MessageEvent<any>)

    workerScope.onmessage?.({
      data: {
        type: 'dispose'
      }
    } as MessageEvent<any>)

    expect(fs.writeFile).toHaveBeenCalledWith('/workspace/src/player.c', 'int player = 1;')
    expect((port.close as any)).toHaveBeenCalledTimes(1)
    expect(workerScope.close).toHaveBeenCalledTimes(1)
  })

  it('reports startup failures when SharedArrayBuffer support is missing', async () => {
    const originalSharedArrayBuffer = globalThis.SharedArrayBuffer
    const workerScope = createWorkerScope()
    const { port } = createMockPort()

    try {
      Object.defineProperty(globalThis, 'SharedArrayBuffer', {
        configurable: true,
        value: undefined
      })

      registerClangdWorker(workerScope, {
        MessageWriter: class {
          constructor(_port: MessagePort) {}

          write() {}
        },
        createModule: vi.fn(),
        mainScriptUrl: '/mock/clangd.js',
        pThreadWorkerUrl: '/mock/clangd.worker.js',
        wasmUrl: '/mock/clangd.wasm'
      })

      workerScope.onmessage?.({
        data: {
          type: 'init',
          lspPort: port,
          snapshot: {
            files: [],
            sourceFileCount: 0,
            workspaceRoot: '/workspace'
          }
        }
      } as MessageEvent<any>)

      await flushMicrotasks()

      expect(workerScope.postMessage).toHaveBeenCalledWith({
        type: 'error',
        message:
          'SharedArrayBuffer is not available. Cross-origin isolation headers (COOP/COEP) may be missing.'
      })
    } finally {
      Object.defineProperty(globalThis, 'SharedArrayBuffer', {
        configurable: true,
        value: originalSharedArrayBuffer
      })
    }
  })

  it('throws a clear error when SharedArrayBuffer support is unavailable', () => {
    const originalSharedArrayBuffer = globalThis.SharedArrayBuffer

    try {
      Object.defineProperty(globalThis, 'SharedArrayBuffer', {
        configurable: true,
        value: undefined
      })

      expect(() => checkSharedArrayBufferSupport()).toThrow(
        'SharedArrayBuffer is not available. Cross-origin isolation headers (COOP/COEP) may be missing.'
      )
    } finally {
      Object.defineProperty(globalThis, 'SharedArrayBuffer', {
        configurable: true,
        value: originalSharedArrayBuffer
      })
    }
  })
})
