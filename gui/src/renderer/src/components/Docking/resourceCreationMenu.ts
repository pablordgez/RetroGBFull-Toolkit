import { PROJECT_SCRIPT_LABELS, type ProjectScriptKind } from '../../../../shared/projectScripts'
import type { ProjectResourceKind } from '../../../../shared/projectResourceModels'

export interface ResourceCreationMenuItem {
  id?: string
  label: string
  disabled?: boolean
  onSelect?: () => void
  children?: ResourceCreationMenuItem[]
}

interface BuildResourceCreationMenuItemsOptions {
  disabled: boolean
  onCreateResource: (resourceType: Exclude<ProjectResourceKind, 'script'>) => void
  onCreateScriptResource: (scriptKind: ProjectScriptKind) => void
}

export const buildResourceCreationMenuItems = ({
  disabled,
  onCreateResource,
  onCreateScriptResource
}: BuildResourceCreationMenuItemsOptions): ResourceCreationMenuItem[] => {
  return [
    {
      id: 'new-folder',
      label: 'Folder',
      disabled,
      onSelect: () => onCreateResource('folder')
    },
    {
      id: 'new-sprite',
      label: 'Sprite',
      disabled,
      onSelect: () => onCreateResource('sprite')
    },
    {
      id: 'new-tileset',
      label: 'Tileset',
      disabled,
      onSelect: () => onCreateResource('tileset')
    },
    {
      id: 'new-tilemap',
      label: 'Tilemap',
      disabled,
      onSelect: () => onCreateResource('tilemap')
    },
    {
      id: 'new-window',
      label: 'Window',
      disabled,
      onSelect: () => onCreateResource('window')
    },
    {
      id: 'new-music',
      label: 'Music',
      disabled,
      onSelect: () => onCreateResource('music')
    },
    {
      id: 'new-scene',
      label: 'Scene',
      disabled,
      onSelect: () => onCreateResource('scene')
    },
    {
      id: 'new-script',
      label: 'Script',
      disabled,
      children: [
        {
          id: 'new-script-actor',
          label: PROJECT_SCRIPT_LABELS.actor,
          disabled,
          onSelect: () => onCreateScriptResource('actor')
        },
        {
          id: 'new-script-scene',
          label: PROJECT_SCRIPT_LABELS.scene,
          disabled,
          onSelect: () => onCreateScriptResource('scene')
        },
        {
          id: 'new-script-general',
          label: PROJECT_SCRIPT_LABELS.general,
          disabled,
          onSelect: () => onCreateScriptResource('general')
        }
      ]
    }
  ]
}
