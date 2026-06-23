import type { SceneCoordinateUnit } from '../SceneHierarchy/sceneHierarchyModel'

export type ChildCoordinateOrigin = 'absolute' | 'relative'

export interface CoordinateModelPreferences {
  coordinateUnit: SceneCoordinateUnit
  childCoordinateOrigin: ChildCoordinateOrigin
}

export const DEFAULT_COORDINATE_MODEL_PREFERENCES: CoordinateModelPreferences = {
  coordinateUnit: 'gui',
  childCoordinateOrigin: 'relative'
}

const isCoordinateUnit = (value: unknown): value is SceneCoordinateUnit => {
  return value === 'gui' || value === 'core'
}

const isChildCoordinateOrigin = (value: unknown): value is ChildCoordinateOrigin => {
  return value === 'absolute' || value === 'relative'
}

export const normalizeCoordinateModelPreferences = (
  preferences: Partial<CoordinateModelPreferences> | null | undefined
): CoordinateModelPreferences => {
  return {
    coordinateUnit: isCoordinateUnit(preferences?.coordinateUnit)
      ? preferences.coordinateUnit
      : DEFAULT_COORDINATE_MODEL_PREFERENCES.coordinateUnit,
    childCoordinateOrigin: isChildCoordinateOrigin(preferences?.childCoordinateOrigin)
      ? preferences.childCoordinateOrigin
      : DEFAULT_COORDINATE_MODEL_PREFERENCES.childCoordinateOrigin
  }
}
