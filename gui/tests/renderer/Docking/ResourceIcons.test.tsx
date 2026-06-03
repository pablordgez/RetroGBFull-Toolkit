import React from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  RetroActorIcon,
  RetroCollisionIcon,
  RetroFileIcon,
  RetroFolderIcon,
  RetroMusicIcon,
  RetroSceneIcon,
  RetroSpriteIcon,
  RetroTilemapIcon,
  RetroTilesetIcon,
  RetroWindowIcon
} from '../../../src/renderer/src/components/Docking/ResourceIcons'

describe('<ResourceIcons />', () => {
  it('renders every icon variant with the provided class name', () => {
    const iconComponents = [
      RetroFolderIcon,
      RetroActorIcon,
      RetroCollisionIcon,
      RetroSceneIcon,
      RetroSpriteIcon,
      RetroTilesetIcon,
      RetroTilemapIcon,
      RetroWindowIcon,
      RetroMusicIcon,
      RetroFileIcon
    ]

    for (const Icon of iconComponents) {
      const { container, unmount } = render(<Icon className="retro-icon" />)
      const svg = container.querySelector('svg')

      expect(svg).toBeTruthy()
      expect(svg).toHaveClass('retro-icon')

      unmount()
    }
  })
})
