import { describe, expect, it } from 'vitest'
import {
  buildProjectTagEnumName,
  parseProjectTagState,
  serializeProjectTagState,
  validateProjectTags
} from '../../src/shared/projectTags'

describe('projectTags', () => {
  it('parses, serializes, and builds generated enum names', () => {
    const state = parseProjectTagState({
      entries: [
        { id: 'player', name: 'Player' },
        { id: 'hazard', name: 'Damage Zone' },
        { id: 1, name: 'Bad' }
      ]
    })

    expect(state.entries).toEqual([
      { id: 'player', name: 'Player' },
      { id: 'hazard', name: 'Damage Zone' }
    ])
    expect(buildProjectTagEnumName('Damage Zone')).toBe('TAG_DAMAGE_ZONE')
    expect(serializeProjectTagState(state)).toEqual({
      entries: [
        { id: 'player', name: 'Player' },
        { id: 'hazard', name: 'Damage Zone' }
      ]
    })
  })

  it('validates blank, reserved, and duplicate generated enum names', () => {
    const issues = validateProjectTags([
      { id: 'blank', name: '' },
      { id: 'none', name: 'None' },
      { id: 'one', name: 'Damage Zone' },
      { id: 'two', name: 'Damage-Zone' }
    ])

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entryId: 'blank', message: 'Name is required.' }),
        expect.objectContaining({ entryId: 'none', message: '"TAG_NONE" is reserved by the engine.' }),
        expect.objectContaining({
          entryId: 'one',
          message: 'Each tag must generate a unique C enum name.'
        }),
        expect.objectContaining({
          entryId: 'two',
          message: 'Each tag must generate a unique C enum name.'
        })
      ])
    )
  })
})
