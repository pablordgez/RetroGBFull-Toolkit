import { describe, expect, it } from 'vitest'
import { withProjectCoreFileOperation } from '../../src/main/projectCoreFileOperations'

describe('projectCoreFileOperations', () => {
  it('serializes core file operations for the same project', async () => {
    const observedOrder: string[] = []
    let releaseFirstOperation = (): void => {}

    const firstOperation = withProjectCoreFileOperation('C:/Projects/Alpha', async () => {
      observedOrder.push('first-start')
      await new Promise<void>((resolve) => {
        releaseFirstOperation = resolve
      })
      observedOrder.push('first-end')
    })
    const secondOperation = withProjectCoreFileOperation('C:/Projects/Alpha', async () => {
      observedOrder.push('second-start')
    })

    await Promise.resolve()

    expect(observedOrder).toEqual(['first-start'])

    releaseFirstOperation()
    await Promise.all([firstOperation, secondOperation])

    expect(observedOrder).toEqual(['first-start', 'first-end', 'second-start'])
  })
})
