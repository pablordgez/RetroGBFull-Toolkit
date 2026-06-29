import { ProjectLauncherError, getProjectLauncherErrorMessage } from './projectLauncherPrimitives'

type ProjectResourceAction = 'load' | 'create' | 'rename' | 'delete' | 'paste' | 'bank'

export const getProjectResourceErrorMessage = (
  error: unknown,
  action: ProjectResourceAction
): string => {
  if (error instanceof ProjectLauncherError) {
    return error.userMessage
  }

  const genericMessageByAction: Record<ProjectResourceAction, string> = {
    load: 'Something went wrong while loading project resources. Please try again.',
    create: 'Something went wrong while creating the resource. Please try again.',
    rename: 'Something went wrong while renaming the resource. Please try again.',
    delete: 'Something went wrong while deleting the resource. Please try again.',
    paste: 'Something went wrong while pasting the resource. Please try again.',
    bank: 'Something went wrong while updating the resource bank. Please try again.'
  }

  const errorCode =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined

  if (errorCode === 'EEXIST') {
    return action === 'rename'
      ? 'A resource with that name already exists in this location.'
      : 'A resource with that name already exists.'
  }

  if (errorCode === 'ENOENT') {
    return action === 'load'
      ? 'The requested resource could not be found.'
      : 'The selected resource could not be found.'
  }

  if (errorCode === 'ENOTEMPTY' || errorCode === 'EPERM' || errorCode === 'EACCES') {
    return getProjectLauncherErrorMessage(error, 'open')
  }

  return genericMessageByAction[action]
}
