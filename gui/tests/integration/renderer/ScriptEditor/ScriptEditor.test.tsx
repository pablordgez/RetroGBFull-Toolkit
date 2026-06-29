import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ScriptEditor } from '../../../../src/renderer/src/components/ScriptEditor/ScriptEditor'
import type { ProjectScriptResourcePayload } from '../../../../src/shared/projectCodeWorkspace'

const runtimeSessionMock = {
  setActiveTab: vi.fn(),
  updateSourceContent: vi.fn(),
  updateHeaderContent: vi.fn(),
  dispose: vi.fn().mockResolvedValue(undefined)
}

const createScriptEditorRuntimeMock = vi.fn().mockResolvedValue(runtimeSessionMock)

vi.mock('../../../../src/renderer/src/components/ScriptEditor/configureMonaco', () => ({
  configureMonaco: vi.fn()
}))

vi.mock('../../../../src/renderer/src/components/ScriptEditor/scriptEditorRuntime', () => ({
  createScriptEditorRuntime: createScriptEditorRuntimeMock
}))

vi.mock('@monaco-editor/react', async () => {
  const React = await import('react')

  const MockMonacoEditor = ({
    value,
    onChange,
    onMount,
    options,
    path,
    theme
  }: {
    value?: string
    onChange?: (value: string | undefined) => void
    options?: { quickSuggestionsDelay?: number }
    path?: string
    theme?: string
    onMount?: (editor: { focus: () => void }) => void
  }): React.ReactElement => {
    React.useEffect(() => {
      onMount?.({ focus: vi.fn() })
    }, [onMount])

    return React.createElement('textarea', {
      'aria-label': 'script editor',
      'data-editor-path': path ?? '',
      'data-quick-suggestions-delay': String(options?.quickSuggestionsDelay ?? ''),
      'data-theme': theme ?? '',
      onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange?.(event.currentTarget.value)
      },
      value: value ?? ''
    })
  }

  return {
    default: MockMonacoEditor,
    loader: {
      config: vi.fn()
    }
  }
})

const generalScriptPayload: ProjectScriptResourcePayload = {
  resourcePath: 'src/Scripts/Test.c',
  scriptKind: 'general',
  displayName: 'Test',
  sourcePath: 'src/Scripts/Test.c',
  headerPath: 'src/Scripts/Test.h',
  sourceContent:
    '#pragma bank 255\n#include "Test.h"\n#include "ScriptEnvironment.h"\n\nBANKREF(Test_bankref)\n\n',
  editableSourceContent: '',
  managedSourcePrefix:
    '#pragma bank 255\n#include "Test.h"\n#include "ScriptEnvironment.h"\n\nBANKREF(Test_bankref)\n\n',
  headerContent: '#ifndef TEST_H\n#define TEST_H\n\n#endif // TEST_H\n'
}

const nonBlankGeneralScriptPayload: ProjectScriptResourcePayload = {
  ...generalScriptPayload,
  sourceContent:
    '#pragma bank 255\n#include "Test.h"\n#include "ScriptEnvironment.h"\n\nBANKREF(Test_bankref)\n\nvoid test(void) {\n}\n',
  editableSourceContent: 'void test(void) {\n}\n'
}

const actorScriptPayload: ProjectScriptResourcePayload = {
  resourcePath: 'src/CustomActors/Hero.c',
  scriptKind: 'actor',
  displayName: 'Hero',
  sourcePath: 'src/CustomActors/Hero.c',
  headerPath: 'src/CustomActors/Hero.h',
  sourceContent:
    '#pragma bank 255\n#include "Hero.h"\n#include "ScriptEnvironment.h"\n\nBANKREF(Hero_bankref)\n\nvoid AINIT(void){\n}\n',
  editableSourceContent: 'void AINIT(void){\n}\n',
  managedSourcePrefix:
    '#pragma bank 255\n#include "Hero.h"\n#include "ScriptEnvironment.h"\n\nBANKREF(Hero_bankref)\n\n',
  headerContent: '#ifndef HERO_H\n#define HERO_H\n#include "Actor/Actor.h"\n\n#endif // HERO_H\n'
}

describe('<ScriptEditor />', () => {
  beforeEach(() => {
    vi.mocked(window.api.loadProjectScriptResource).mockReset()
    vi.mocked(window.api.saveProjectScriptResource).mockReset()
    vi.mocked(window.api.getProjectCodeWorkspaceSnapshot).mockReset()
    vi.mocked(window.api.getAppPreferences).mockReset()
    vi.mocked(window.api.saveAppPreferences).mockReset()
    vi.mocked(window.api.confirmEditorClose).mockClear()
    vi.mocked(window.api.onEditorCloseRequested).mockReset()
    createScriptEditorRuntimeMock.mockClear()
    runtimeSessionMock.setActiveTab.mockClear()
    runtimeSessionMock.updateSourceContent.mockClear()
    runtimeSessionMock.updateHeaderContent.mockClear()
    runtimeSessionMock.dispose.mockClear()
    createScriptEditorRuntimeMock.mockResolvedValue(runtimeSessionMock)
    vi.mocked(window.api.getAppPreferences).mockResolvedValue({
      scriptEditorTheme: 'light',
      coordinateUnit: 'gui',
      childCoordinateOrigin: 'relative',
      autoBankScriptFunctions: true
    })
    vi.mocked(window.api.saveAppPreferences).mockImplementation(async (preferences) => ({
      scriptEditorTheme: preferences.scriptEditorTheme ?? 'light',
      coordinateUnit: preferences.coordinateUnit ?? 'gui',
      childCoordinateOrigin: preferences.childCoordinateOrigin ?? 'relative',
      autoBankScriptFunctions: preferences.autoBankScriptFunctions ?? true
    }))
    vi.mocked(window.api.loadProjectScriptResource).mockResolvedValue(generalScriptPayload)
    vi.mocked(window.api.saveProjectScriptResource).mockResolvedValue({
      resourcePath: 'src/Scripts/Test.c',
      scriptKind: 'general',
      sourceContent:
        '#pragma bank 255\n#include "Test.h"\n#include "ScriptEnvironment.h"\n\nBANKREF(Test_bankref)\n\n',
      editableSourceContent: '',
      headerContent: '#ifndef TEST_H\n#define TEST_H\n\n#endif // TEST_H\n'
    })
    vi.mocked(window.api.getProjectCodeWorkspaceSnapshot).mockResolvedValue({
      workspaceRoot: '/workspace',
      files: [],
      sourceFileCount: 0
    })
  })

  it('loads empty general scripts without booting code intelligence until the user types', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/script-editor?projectPath=/projects/Test&resourcePath=src%2FScripts%2FTest.c&scriptKind=general'
        ]}
      >
        <ScriptEditor />
      </MemoryRouter>
    )

    expect(await screen.findByText('Test (General Script)')).toBeInTheDocument()
    expect(screen.getByLabelText('script editor')).toHaveValue('\n')
    expect(screen.getByLabelText('script editor')).toHaveAttribute(
      'data-quick-suggestions-delay',
      '250'
    )
    expect(window.api.getProjectCodeWorkspaceSnapshot).not.toHaveBeenCalled()
    expect(createScriptEditorRuntimeMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.api.saveProjectScriptResource).toHaveBeenCalledWith(
        '/projects/Test',
        'src/Scripts/Test.c',
        'general',
        '',
        '#ifndef TEST_H\n#define TEST_H\n\n#endif // TEST_H\n',
        { autoBankScriptFunctions: true }
      )
    })

    fireEvent.change(screen.getByLabelText('script editor'), {
      target: {
        value: '#include <stdio.h>\n'
      }
    })

    await waitFor(() => {
      expect(screen.getByLabelText('script editor')).toHaveValue('#include <stdio.h>\n')
    })

    await waitFor(() => {
      expect(window.api.getProjectCodeWorkspaceSnapshot).toHaveBeenCalledWith('/projects/Test')
      expect(createScriptEditorRuntimeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sourcePath: 'src/Scripts/Test.c',
          editableSourceContent: '#include <stdio.h>\n'
        })
      )
    })
  })

  it('starts code intelligence immediately for non-blank general scripts', async () => {
    vi.mocked(window.api.loadProjectScriptResource).mockResolvedValue(nonBlankGeneralScriptPayload)

    render(
      <MemoryRouter
        initialEntries={[
          '/script-editor?projectPath=/projects/Test&resourcePath=src%2FScripts%2FTest.c&scriptKind=general'
        ]}
      >
        <ScriptEditor />
      </MemoryRouter>
    )

    expect(await screen.findByText('Test (General Script)')).toBeInTheDocument()
    expect(screen.getByLabelText('script editor')).toHaveValue('void test(void) {\n}\n')

    await waitFor(() => {
      expect(window.api.getProjectCodeWorkspaceSnapshot).toHaveBeenCalledWith('/projects/Test')
      expect(createScriptEditorRuntimeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sourcePath: 'src/Scripts/Test.c',
          editableSourceContent: 'void test(void) {\n}\n'
        })
      )
    })
  })

  it('shows an error when the editor is opened without a valid script resource', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/script-editor?projectPath=/projects/Test&resourcePath=src%2FScripts%2FTest.c'
        ]}
      >
        <ScriptEditor />
      </MemoryRouter>
    )

    expect(
      await screen.findByText('This window was opened without a valid script resource.')
    ).toBeInTheDocument()
    expect(window.api.loadProjectScriptResource).not.toHaveBeenCalled()
    expect(window.api.getProjectCodeWorkspaceSnapshot).not.toHaveBeenCalled()
  })

  it('starts code intelligence immediately for actor scripts', async () => {
    vi.mocked(window.api.loadProjectScriptResource).mockResolvedValue(actorScriptPayload)

    render(
      <MemoryRouter
        initialEntries={[
          '/script-editor?projectPath=/projects/Test&resourcePath=src%2FCustomActors%2FHero.c&scriptKind=actor'
        ]}
      >
        <ScriptEditor />
      </MemoryRouter>
    )

    expect(await screen.findByText('Hero (Actor Script)')).toBeInTheDocument()

    await waitFor(() => {
      expect(window.api.getProjectCodeWorkspaceSnapshot).toHaveBeenCalledWith('/projects/Test')
      expect(createScriptEditorRuntimeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sourcePath: 'src/CustomActors/Hero.c',
          editableSourceContent: 'void AINIT(void){\n}\n'
        })
      )
    })
  })

  it('shows saved BANKED rewrites immediately in the open editor', async () => {
    vi.mocked(window.api.loadProjectScriptResource).mockResolvedValue(actorScriptPayload)
    vi.mocked(window.api.saveProjectScriptResource).mockResolvedValue({
      resourcePath: 'src/CustomActors/Hero.c',
      scriptKind: 'actor',
      sourceContent:
        '#pragma bank 255\n#include "Hero.h"\n#include "ScriptEnvironment.h"\n\nBANKREF(Hero_bankref)\n\nvoid AINIT(void) BANKED{\n}\n',
      editableSourceContent: 'void AINIT(void) BANKED{\n}\n',
      headerContent:
        '#ifndef HERO_H\n#define HERO_H\n#include "Actor/Actor.h"\n\n#endif // HERO_H\n'
    })

    render(
      <MemoryRouter
        initialEntries={[
          '/script-editor?projectPath=/projects/Test&resourcePath=src%2FCustomActors%2FHero.c&scriptKind=actor'
        ]}
      >
        <ScriptEditor />
      </MemoryRouter>
    )

    const editor = await screen.findByLabelText('script editor')
    expect(editor).toHaveValue('void AINIT(void){\n}\n')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(editor).toHaveValue('void AINIT(void) BANKED{\n}\n')
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    })
  })

  it('passes the disabled auto BANKED preference when saving scripts', async () => {
    vi.mocked(window.api.getAppPreferences).mockResolvedValue({
      scriptEditorTheme: 'light',
      coordinateUnit: 'gui',
      childCoordinateOrigin: 'relative',
      autoBankScriptFunctions: false
    })
    vi.mocked(window.api.loadProjectScriptResource).mockResolvedValue(actorScriptPayload)

    render(
      <MemoryRouter
        initialEntries={[
          '/script-editor?projectPath=/projects/Test&resourcePath=src%2FCustomActors%2FHero.c&scriptKind=actor'
        ]}
      >
        <ScriptEditor />
      </MemoryRouter>
    )

    await screen.findByLabelText('script editor')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.api.saveProjectScriptResource).toHaveBeenCalledWith(
        '/projects/Test',
        'src/CustomActors/Hero.c',
        'actor',
        'void AINIT(void){\n}\n',
        '#ifndef HERO_H\n#define HERO_H\n#include "Actor/Actor.h"\n\n#endif // HERO_H\n',
        { autoBankScriptFunctions: false }
      )
    })
  })

  it('handles clean close requests, save shortcuts, and canceling the close prompt', async () => {
    let closeListener: (() => void) | undefined

    vi.mocked(window.api.onEditorCloseRequested).mockImplementation((listener) => {
      closeListener = listener
      return () => undefined
    })
    vi.mocked(window.api.loadProjectScriptResource).mockResolvedValue(actorScriptPayload)

    render(
      <MemoryRouter
        initialEntries={[
          '/script-editor?projectPath=/projects/Test&resourcePath=src%2FCustomActors%2FHero.c&scriptKind=actor'
        ]}
      >
        <ScriptEditor />
      </MemoryRouter>
    )

    const editor = await screen.findByLabelText('script editor')

    await act(async () => {
      closeListener?.()
    })

    await waitFor(() => {
      expect(window.api.confirmEditorClose).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    expect(window.api.saveProjectScriptResource).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 's', ctrlKey: true })

    await waitFor(() => {
      expect(window.api.saveProjectScriptResource).toHaveBeenCalledWith(
        '/projects/Test',
        'src/CustomActors/Hero.c',
        'actor',
        'void AINIT(void){\n}\n',
        '#ifndef HERO_H\n#define HERO_H\n#include "Actor/Actor.h"\n\n#endif // HERO_H\n',
        { autoBankScriptFunctions: true }
      )
    })

    fireEvent.change(editor, {
      target: {
        value: 'void AINIT(void){\n  hero_update();\n}\n'
      }
    })

    await act(async () => {
      closeListener?.()
    })

    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(window.api.confirmEditorClose).toHaveBeenCalledTimes(1)
  })

  it('switches tabs, updates runtime buffers, toggles the theme, and discards close prompts', async () => {
    let closeListener: (() => void) | undefined

    vi.mocked(window.api.onEditorCloseRequested).mockImplementation((listener) => {
      closeListener = listener
      return () => undefined
    })
    vi.mocked(window.api.loadProjectScriptResource).mockResolvedValue(actorScriptPayload)

    render(
      <MemoryRouter
        initialEntries={[
          '/script-editor?projectPath=/projects/Test&resourcePath=src%2FCustomActors%2FHero.c&scriptKind=actor'
        ]}
      >
        <ScriptEditor />
      </MemoryRouter>
    )

    const editor = await screen.findByLabelText('script editor')

    await waitFor(() => {
      expect(createScriptEditorRuntimeMock).toHaveBeenCalled()
    })

    expect(editor).toHaveAttribute('data-editor-path', 'file:///workspace/src/CustomActors/Hero.c')
    expect(editor).toHaveAttribute('data-theme', 'vs')

    fireEvent.click(screen.getByRole('button', { name: 'Hero.h' }))

    await waitFor(() => {
      expect(runtimeSessionMock.setActiveTab).toHaveBeenCalledWith('header')
    })

    expect(editor).toHaveAttribute('data-editor-path', 'file:///workspace/src/CustomActors/Hero.h')

    fireEvent.change(editor, {
      target: {
        value: '#ifndef HERO_H\n#define HERO_H\n\nvoid hero_update(void);\n\n#endif // HERO_H\n'
      }
    })

    await waitFor(() => {
      expect(runtimeSessionMock.updateHeaderContent).toHaveBeenCalledWith(
        '#ifndef HERO_H\n#define HERO_H\n\nvoid hero_update(void);\n\n#endif // HERO_H\n'
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Dark Mode' }))
    expect(screen.getByRole('button', { name: 'Light Mode' })).toBeInTheDocument()
    expect(editor).toHaveAttribute('data-theme', 'vs-dark')
    await waitFor(() => {
      expect(window.api.saveAppPreferences).toHaveBeenLastCalledWith({ scriptEditorTheme: 'dark' })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Hero.c' }))

    await waitFor(() => {
      expect(runtimeSessionMock.setActiveTab).toHaveBeenCalledWith('source')
    })

    fireEvent.change(editor, {
      target: {
        value: 'void AINIT(void){\n  hero_update();\n}\n'
      }
    })

    await waitFor(() => {
      expect(runtimeSessionMock.updateSourceContent).toHaveBeenCalledWith(
        'void AINIT(void){\n  hero_update();\n}\n'
      )
    })

    await act(async () => {
      closeListener?.()
    })

    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: "Don't Save" }))

    await waitFor(() => {
      expect(window.api.confirmEditorClose).toHaveBeenCalledTimes(1)
    })
  })

  it('keeps the close prompt open when saving from the prompt fails', async () => {
    let closeListener: (() => void) | undefined

    vi.mocked(window.api.onEditorCloseRequested).mockImplementation((listener) => {
      closeListener = listener
      return () => undefined
    })
    vi.mocked(window.api.loadProjectScriptResource).mockResolvedValue(actorScriptPayload)
    vi.mocked(window.api.saveProjectScriptResource).mockRejectedValueOnce(new Error('Save failed'))

    render(
      <MemoryRouter
        initialEntries={[
          '/script-editor?projectPath=/projects/Test&resourcePath=src%2FCustomActors%2FHero.c&scriptKind=actor'
        ]}
      >
        <ScriptEditor />
      </MemoryRouter>
    )

    const editor = await screen.findByLabelText('script editor')

    fireEvent.change(editor, {
      target: {
        value: 'void AINIT(void){\n  hero_update();\n}\n'
      }
    })

    await act(async () => {
      closeListener?.()
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.api.saveProjectScriptResource).toHaveBeenCalledWith(
        '/projects/Test',
        'src/CustomActors/Hero.c',
        'actor',
        'void AINIT(void){\n  hero_update();\n}\n',
        '#ifndef HERO_H\n#define HERO_H\n#include "Actor/Actor.h"\n\n#endif // HERO_H\n',
        { autoBankScriptFunctions: true }
      )
    })
    expect(await screen.findByText('Save failed')).toBeInTheDocument()
    expect(window.api.confirmEditorClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
