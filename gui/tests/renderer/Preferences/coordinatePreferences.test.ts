import { describe, expect, it } from 'vitest'
import {
  DEFAULT_COORDINATE_MODEL_PREFERENCES,
  normalizeCoordinateModelPreferences
} from '../../../src/renderer/src/components/Preferences/coordinatePreferences'

describe('coordinatePreferences', () => {
  it('uses defaults when preferences are missing', () => {
    expect(normalizeCoordinateModelPreferences(null)).toEqual(
      DEFAULT_COORDINATE_MODEL_PREFERENCES
    )
    expect(normalizeCoordinateModelPreferences(undefined)).toEqual(
      DEFAULT_COORDINATE_MODEL_PREFERENCES
    )
    expect(normalizeCoordinateModelPreferences({})).toEqual(
      DEFAULT_COORDINATE_MODEL_PREFERENCES
    )
  })

  it('preserves supported coordinate preferences', () => {
    expect(
      normalizeCoordinateModelPreferences({
        coordinateUnit: 'core',
        childCoordinateOrigin: 'absolute'
      })
    ).toEqual({
      coordinateUnit: 'core',
      childCoordinateOrigin: 'absolute'
    })

    expect(
      normalizeCoordinateModelPreferences({
        coordinateUnit: 'gui',
        childCoordinateOrigin: 'relative'
      })
    ).toEqual(DEFAULT_COORDINATE_MODEL_PREFERENCES)
  })

  it('falls back per field for unsupported preference values', () => {
    expect(
      normalizeCoordinateModelPreferences({
        coordinateUnit: 'pixels',
        childCoordinateOrigin: 'scene'
      } as never)
    ).toEqual(DEFAULT_COORDINATE_MODEL_PREFERENCES)

    expect(
      normalizeCoordinateModelPreferences({
        coordinateUnit: 'core',
        childCoordinateOrigin: 'scene'
      } as never)
    ).toEqual({
      coordinateUnit: 'core',
      childCoordinateOrigin: 'relative'
    })

    expect(
      normalizeCoordinateModelPreferences({
        coordinateUnit: 'pixels',
        childCoordinateOrigin: 'absolute'
      } as never)
    ).toEqual({
      coordinateUnit: 'gui',
      childCoordinateOrigin: 'absolute'
    })
  })
})
