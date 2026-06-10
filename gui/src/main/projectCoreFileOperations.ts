import { resolve } from 'path'

const projectCoreFileOperations = new Map<string, Promise<void>>()

export const withProjectCoreFileOperation = async <T>(
  projectPath: string,
  operation: () => Promise<T>
): Promise<T> => {
  const projectOperationKey = resolve(projectPath)
  const previousOperation = projectCoreFileOperations.get(projectOperationKey) ?? Promise.resolve()
  let releaseCurrentOperation!: () => void
  const currentOperation = new Promise<void>((resolveCurrentOperation) => {
    releaseCurrentOperation = resolveCurrentOperation
  })
  const queuedOperation = previousOperation.then(() => currentOperation)

  projectCoreFileOperations.set(projectOperationKey, queuedOperation)
  await previousOperation

  try {
    return await operation()
  } finally {
    releaseCurrentOperation()

    if (projectCoreFileOperations.get(projectOperationKey) === queuedOperation) {
      projectCoreFileOperations.delete(projectOperationKey)
    }
  }
}
