import { describe, expect, it } from 'vitest'
import { ProjectLauncherError } from '../../src/main/projectLauncher'
import { getProjectResourceErrorMessage } from '../../src/main/projectResourceErrors'

describe('projectResourceErrors', () => {
  it('preserves explicit launcher error messages', () => {
    expect(
      getProjectResourceErrorMessage(new ProjectLauncherError('Choose another folder.'), 'load')
    ).toBe('Choose another folder.')
  })

  it('maps common filesystem errors to resource-specific messages', () => {
    expect(getProjectResourceErrorMessage({ code: 'EEXIST' }, 'rename')).toBe(
      'A resource with that name already exists in this location.'
    )
    expect(getProjectResourceErrorMessage({ code: 'EEXIST' }, 'create')).toBe(
      'A resource with that name already exists.'
    )
    expect(getProjectResourceErrorMessage({ code: 'ENOENT' }, 'load')).toBe(
      'The requested resource could not be found.'
    )
    expect(getProjectResourceErrorMessage({ code: 'ENOENT' }, 'delete')).toBe(
      'The selected resource could not be found.'
    )
    expect(getProjectResourceErrorMessage({ code: 'EACCES' }, 'paste')).toBe(
      'This location cannot be accessed with the current permissions. Choose a different folder or check your permissions.'
    )
    expect(getProjectResourceErrorMessage({ code: 'EPERM' }, 'bank')).toBe(
      'This location cannot be accessed with the current permissions. Choose a different folder or check your permissions.'
    )
    expect(getProjectResourceErrorMessage({ code: 'ENOTEMPTY' }, 'delete')).toBe(
      'Something went wrong while opening the project. Please try again.'
    )
  })

  it('falls back to generic messages by action', () => {
    expect(getProjectResourceErrorMessage(null, 'load')).toBe(
      'Something went wrong while loading project resources. Please try again.'
    )
    expect(getProjectResourceErrorMessage({ code: 'UNKNOWN' }, 'create')).toBe(
      'Something went wrong while creating the resource. Please try again.'
    )
    expect(getProjectResourceErrorMessage('bad', 'rename')).toBe(
      'Something went wrong while renaming the resource. Please try again.'
    )
    expect(getProjectResourceErrorMessage(undefined, 'delete')).toBe(
      'Something went wrong while deleting the resource. Please try again.'
    )
    expect(getProjectResourceErrorMessage(new Error('bad'), 'paste')).toBe(
      'Something went wrong while pasting the resource. Please try again.'
    )
    expect(getProjectResourceErrorMessage({}, 'bank')).toBe(
      'Something went wrong while updating the resource bank. Please try again.'
    )
  })
})
