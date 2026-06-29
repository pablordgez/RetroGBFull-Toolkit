import { describe, expect, it } from 'vitest'
import { resolve } from 'path'
import { DEFAULT_PROJECT_RESOURCE_BANK } from '../../src/shared/projectResourceModels'
import { ProjectLauncherError } from '../../src/main/projectLauncherPrimitives'
import {
  isValidProjectResourceBank,
  normalizeParentPath,
  normalizeProjectResourceBank,
  normalizeResourcePath,
  resolvePathWithinProject
} from '../../src/main/projectResourcePaths'
import { resolveResourceDirectory } from '../../src/main/projectResourceFilesystem'

describe('projectResourcePaths', () => {
  it('normalizes resource and parent paths across separators and empty segments', () => {
    expect(normalizeResourcePath(' /Sprites// ./Hero.sprite.json ')).toBe(
      'Sprites/Hero.sprite.json'
    )
    expect(normalizeResourcePath('Sprites\\ Actors\\.\\Hero.actor.json')).toBe(
      'Sprites/Actors/Hero.actor.json'
    )
    expect(normalizeParentPath(undefined)).toBeNull()
    expect(normalizeParentPath(' ./Scenes ')).toBe('Scenes')
  })

  it('resolves only paths contained by the project directory', () => {
    const projectPath = resolve('projects/Game')

    expect(resolvePathWithinProject(projectPath, 'Scenes/Intro.rgbscene.json')).toBe(
      resolve(projectPath, 'Scenes/Intro.rgbscene.json')
    )
    expect(resolvePathWithinProject(projectPath, '', undefined, false)).toBe(projectPath)

    expect(() => resolvePathWithinProject(projectPath, '../Other')).toThrow(ProjectLauncherError)
    expect(() => resolvePathWithinProject(projectPath, resolve('outside/Other'))).toThrow(
      'The selected path is outside the project directory.'
    )
    expect(() => resolveResourceDirectory(projectPath, '../Other')).toThrow(
      'The selected folder is outside the project directory.'
    )
  })

  it('validates and normalizes resource banks', () => {
    expect(isValidProjectResourceBank(0)).toBe(true)
    expect(isValidProjectResourceBank(255)).toBe(true)
    expect(isValidProjectResourceBank(12.5)).toBe(false)
    expect(isValidProjectResourceBank(-1)).toBe(false)
    expect(isValidProjectResourceBank(256)).toBe(false)
    expect(isValidProjectResourceBank('7')).toBe(false)

    expect(normalizeProjectResourceBank(42)).toBe(42)
    expect(normalizeProjectResourceBank('42')).toBe(DEFAULT_PROJECT_RESOURCE_BANK)
  })
})
