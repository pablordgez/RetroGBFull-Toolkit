import { describe, expect, it } from 'vitest'
import {
  ProjectLauncherError,
  getProjectLauncherErrorMessage,
  isValidProjectName
} from '../../src/main/projectLauncherPrimitives'

describe('projectLauncher unit helpers', () => {
  it('rejects invalid project names that would break on Windows or Linux', () => {
    expect(isValidProjectName('')).toBe(false)
    expect(isValidProjectName('   ')).toBe(false)
    expect(isValidProjectName('.')).toBe(false)
    expect(isValidProjectName('..')).toBe(false)
    expect(isValidProjectName('Bad<Name')).toBe(false)
    expect(isValidProjectName('bad/name')).toBe(false)
    expect(isValidProjectName('Trailing.')).toBe(false)
    expect(isValidProjectName('Trailing ')).toBe(true)
    expect(isValidProjectName('CON')).toBe(false)
    expect(isValidProjectName('con')).toBe(false)
    expect(isValidProjectName('ValidProject')).toBe(true)
  })

  it('maps common filesystem and validation errors to friendly action-specific messages', () => {
    expect(getProjectLauncherErrorMessage(new ProjectLauncherError('Already friendly.'), 'open')).toBe(
      'Already friendly.'
    )
    expect(getProjectLauncherErrorMessage({ code: 'EEXIST' }, 'create')).toBe(
      'A project folder with that name already exists in the selected location. Choose a different name or location.'
    )
    expect(getProjectLauncherErrorMessage({ code: 'EACCES' }, 'open')).toContain(
      'cannot be accessed'
    )
    expect(getProjectLauncherErrorMessage({ code: 'EPERM' }, 'open')).toContain(
      'cannot be accessed'
    )
    expect(getProjectLauncherErrorMessage({ code: 'ENOENT' }, 'create')).toBe(
      'The selected location is no longer available. Please choose another folder and try again.'
    )
    expect(getProjectLauncherErrorMessage({ code: 'ENOENT' }, 'open')).toBe(
      'The selected project location could not be found. Please choose the project folder again.'
    )
    expect(getProjectLauncherErrorMessage({ code: 'ENOSPC' }, 'recent-list')).toBe(
      'There is not enough disk space to complete this action.'
    )
    expect(getProjectLauncherErrorMessage({ code: 'ENOSPC' }, 'create')).toBe(
      'There is not enough disk space to create the project.'
    )
  })

  it('falls back to a generic message for unexpected errors', () => {
    expect(getProjectLauncherErrorMessage('raw internal failure', 'create')).toBe(
      'Something went wrong while creating the project. Please try again.'
    )
    expect(getProjectLauncherErrorMessage(new Error('raw internal failure'), 'open')).toBe(
      'Something went wrong while opening the project. Please try again.'
    )
    expect(getProjectLauncherErrorMessage(new Error('raw internal failure'), 'recent-list')).toBe(
      'Something went wrong while loading recent projects.'
    )
  })
})
