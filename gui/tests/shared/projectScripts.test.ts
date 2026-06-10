import { describe, expect, it } from 'vitest'
import {
  buildProjectScriptFileName,
  buildProjectScriptHeaderFileName,
  getProjectScriptDisplayName,
  getProjectScriptKindFromPath,
  isProjectScriptPathWithinKindRoot,
  isProjectScriptSourcePath
} from '../../src/shared/projectScripts'

describe('projectScripts', () => {
  it('builds source and header file names', () => {
    expect(buildProjectScriptFileName('Hero')).toBe('Hero.c')
    expect(buildProjectScriptHeaderFileName('Hero')).toBe('Hero.h')
  })

  it('gets display names from source, header, and extensionless files', () => {
    expect(getProjectScriptDisplayName('Hero.c')).toBe('Hero')
    expect(getProjectScriptDisplayName('Hero.C')).toBe('Hero')
    expect(getProjectScriptDisplayName('Hero.h')).toBe('Hero')
    expect(getProjectScriptDisplayName('Hero.txt')).toBe('Hero.txt')
  })

  it('detects script kind from normalized path and source extension', () => {
    expect(getProjectScriptKindFromPath('src/CustomActors/Hero.c')).toBe('actor')
    expect(getProjectScriptKindFromPath('src\\CustomScenes\\Intro.c')).toBe('scene')
    expect(getProjectScriptKindFromPath('src/Scripts/Boot.c')).toBe('general')
    expect(getProjectScriptKindFromPath('src/Other/Boot.c')).toBeNull()
    expect(isProjectScriptSourcePath('src/Scripts/Boot.C')).toBe(true)
    expect(isProjectScriptSourcePath('src/Scripts/Boot.h')).toBe(false)
  })

  it('checks whether a path is within the intended script kind root', () => {
    expect(isProjectScriptPathWithinKindRoot('actor', 'src/CustomActors')).toBe(true)
    expect(isProjectScriptPathWithinKindRoot('actor', 'src/CustomActors/Enemies')).toBe(true)
    expect(isProjectScriptPathWithinKindRoot('actor', 'src\\CustomActors\\Enemies')).toBe(true)
    expect(isProjectScriptPathWithinKindRoot('actor', 'src/CustomScenes')).toBe(false)
    expect(isProjectScriptPathWithinKindRoot('actor', 'src/Scripts')).toBe(false)
    expect(isProjectScriptPathWithinKindRoot('actor', '')).toBe(false)
  })
})
