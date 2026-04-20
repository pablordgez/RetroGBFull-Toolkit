import { describe, expect, it } from 'vitest'
import {
  parseProjectSaveDataState,
  serializeProjectSaveDataState,
  validateProjectSaveDataEntries
} from '../../src/shared/projectSaveData'

describe('projectSaveData helpers', () => {
  it('defaults missing save data to an empty entry list', () => {
    expect(parseProjectSaveDataState(undefined)).toEqual({ entries: [] })
    expect(parseProjectSaveDataState({})).toEqual({ entries: [] })
  })

  it('round-trips valid save data entries', () => {
    const state = parseProjectSaveDataState({
      entries: [
        {
          id: 'coins',
          name: 'coins',
          type: 'uint8_t',
          defaultValue: '0'
        }
      ]
    })

    expect(serializeProjectSaveDataState(state)).toEqual({
      entries: [
        {
          id: 'coins',
          name: 'coins',
          type: 'uint8_t',
          defaultValue: '0'
        }
      ]
    })
  })

  it('reports structural save-data issues', () => {
    const issues = validateProjectSaveDataEntries([
      {
        id: 'signature',
        name: 'signature',
        type: '',
        defaultValue: ''
      },
      {
        id: 'duplicate',
        name: 'coins',
        type: 'uint8_t',
        defaultValue: '0'
      },
      {
        id: 'duplicate-two',
        name: 'coins',
        type: 'uint8_t',
        defaultValue: '1'
      }
    ])

    expect(issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        'Type is required.',
        'Default value is required.',
        '"signature" is reserved by the toolkit.',
        'Each save-data name must be unique.'
      ])
    )
  })
})
