import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

describe('core half-rate scheduling', () => {
  it('runs half-rate callbacks opposite half-rate actor drawing', async () => {
    const coreSource = resolve(process.cwd(), '..', 'core', 'src')
    const [gameManagerSource, sceneSource] = await Promise.all([
      readFile(resolve(coreSource, 'GameManager', 'GameManager.c'), 'utf-8'),
      readFile(resolve(coreSource, 'Scene', 'Scene.c'), 'utf-8')
    ])

    expect(gameManagerSource).toContain(
      'if(!THIS_SCENE->collision_callbacks_30hz || HALF_RATE_PHASE)'
    )
    expect(sceneSource).toContain('(actor->draw_30hz && HALF_RATE_PHASE)')
  })
})
