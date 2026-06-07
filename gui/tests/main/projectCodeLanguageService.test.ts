import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureProjectDirectory, walkProjectCodeFiles } from '../../src/main/projectCodeFiles'
import { getProjectCodeWorkspaceSnapshot } from '../../src/main/projectCodeLanguageService'
import { PROJECT_CODE_WORKSPACE_STUB_ROOT } from '../../src/shared/projectCodeWorkspace'

vi.mock('../../src/main/projectCodeFiles', () => ({
  ensureProjectDirectory: vi.fn(),
  walkProjectCodeFiles: vi.fn()
}))

describe('projectCodeLanguageService', () => {
  beforeEach(() => {
    vi.mocked(ensureProjectDirectory).mockReset()
    vi.mocked(walkProjectCodeFiles).mockReset()
  })

  it('provides clangd stubs for banked script preambles and text macros', async () => {
    vi.mocked(ensureProjectDirectory).mockResolvedValue('C:/Project')
    vi.mocked(walkProjectCodeFiles).mockRejectedValue(
      Object.assign(new Error('missing directory'), { code: 'ENOENT' })
    )

    const snapshot = await getProjectCodeWorkspaceSnapshot('C:/Project')
    const gbHeader = snapshot.files.find(
      (file) => file.path === `${PROJECT_CODE_WORKSPACE_STUB_ROOT}/gb/gb.h`
    )
    const farPtrHeader = snapshot.files.find(
      (file) => file.path === `${PROJECT_CODE_WORKSPACE_STUB_ROOT}/gbdk/far_ptr.h`
    )

    expect(gbHeader?.content).toContain('#define BANKREF(name) extern const void* name;')
    expect(gbHeader?.content).toContain('#define BANKREF_EXTERN(name) extern const void* name;')
    expect(gbHeader?.content).toContain('extern uint8_t _current_bank;')
    expect(farPtrHeader?.content).toContain('#include <gb/gb.h>')
  })
})
