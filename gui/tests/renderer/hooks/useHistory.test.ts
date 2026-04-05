import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { type Command } from '../../../src/renderer/src/components/hooks/history/Command'
import { useHistory } from '../../../src/renderer/src/components/hooks/history/useHistory'

const createMockCommand = (id: string): Command => ({
  undo: vi.fn(),
  redo: vi.fn(),
  toString: () => id
})

describe('useHistory Hook', () => {
  it('initializes with empty state', () => {
    const { result } = renderHook(() => useHistory(10))

    expect(result.current.historyLength).toBe(0)
    expect(result.current.historyIndex).toBe(-1)
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  it('records a new command and updates index', () => {
    const { result } = renderHook(() => useHistory(10))
    const cmd = createMockCommand('cmd1')

    act(() => {
      result.current.record(cmd)
    })

    expect(result.current.historyLength).toBe(1)
    expect(result.current.historyIndex).toBe(0)
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)
  })

  it('performs undo and redo operations', async () => {
    const { result } = renderHook(() => useHistory(10))
    const cmd = createMockCommand('cmd1')

    act(() => {
      result.current.record(cmd)
    })

    await act(async () => {
      await result.current.undo()
    })

    expect(cmd.undo).toHaveBeenCalled()
    expect(result.current.historyIndex).toBe(-1)
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(true)

    await act(async () => {
      await result.current.redo()
    })

    expect(cmd.redo).toHaveBeenCalled()
    expect(result.current.historyIndex).toBe(0)
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)
  })

  it('truncates future history when recording after undo (Branching)', async () => {
    const { result } = renderHook(() => useHistory(10))

    act(() => {
      result.current.record(createMockCommand('1'))
      result.current.record(createMockCommand('2'))
      result.current.record(createMockCommand('3'))
    })

    expect(result.current.historyLength).toBe(3)
    expect(result.current.historyIndex).toBe(2)

    await act(async () => {
      await result.current.undo()
    })
    await act(async () => {
      await result.current.undo()
    })

    expect(result.current.historyIndex).toBe(0)

    act(() => {
      result.current.record(createMockCommand('4'))
    })

    expect(result.current.historyLength).toBe(2)
    expect(result.current.historyIndex).toBe(1)
    expect(result.current.canRedo).toBe(false)
  })

  it('respects the maxHistory limit by shifting commands', async () => {
    const maxHistory = 3
    const { result } = renderHook(() => useHistory(maxHistory))

    act(() => {
      result.current.record(createMockCommand('1'))
      result.current.record(createMockCommand('2'))
      result.current.record(createMockCommand('3'))
    })

    expect(result.current.historyLength).toBe(3)
    expect(result.current.historyIndex).toBe(2)

    act(() => {
      result.current.record(createMockCommand('4'))
    })

    expect(result.current.historyLength).toBe(3)
    expect(result.current.historyIndex).toBe(2)

    await act(async () => {
      await result.current.undo()
    })
    await act(async () => {
      await result.current.undo()
    })

    expect(result.current.historyIndex).toBe(0)
    expect(result.current.canUndo).toBe(true)

    await act(async () => {
      await result.current.undo()
    })

    expect(result.current.historyIndex).toBe(-1)
  })

  it('handles multiple record calls in rapid succession (simulating batch updates)', () => {
    const { result } = renderHook(() => useHistory(10))
    const cmd1 = createMockCommand('cmd1')
    const cmd2 = createMockCommand('cmd2')

    act(() => {
      result.current.record(cmd1)
      result.current.record(cmd2)
    })

    expect(result.current.historyLength).toBe(2)
    expect(result.current.historyIndex).toBe(1)
  })

  it('handles undo/redo boundary conditions correctly', async () => {
    const { result } = renderHook(() => useHistory(3))
    const cmd1 = createMockCommand('cmd1')
    const cmd2 = createMockCommand('cmd2')
    const cmd3 = createMockCommand('cmd3')
    const cmd4 = createMockCommand('cmd4')

    act(() => {
      result.current.record(cmd1)
      result.current.record(cmd2)
      result.current.record(cmd3)
      result.current.record(cmd4)
    })

    expect(result.current.historyLength).toBe(3)

    await act(async () => {
      await result.current.undo()
    })
    expect(result.current.historyIndex).toBe(1)

    await act(async () => {
      await result.current.undo()
    })
    expect(result.current.historyIndex).toBe(0)

    await act(async () => {
      await result.current.undo()
    })
    expect(result.current.historyIndex).toBe(-1)

    await act(async () => {
      await result.current.undo()
    })
    expect(result.current.historyIndex).toBe(-1)
  })
})
