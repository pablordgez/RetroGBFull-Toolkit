import { spawn } from 'child_process'
import { shell } from 'electron'
import { readdir, stat } from 'fs/promises'
import { dirname, extname, join, relative } from 'path'
import type {
  BuildAndCompileProjectResult,
  CompileProjectResult,
  ProjectBuildProgressPayload
} from '../shared/projectCodeWorkspace'
import { buildProjectCode } from './projectBuildCode'
import { ensureProjectDirectory } from './projectCodeShared'
import { ensureBundledGbdkAvailableForProject } from './projectEngineBundle'
import { ProjectLauncherError } from './projectLauncher'
import { getMakeToolchainStatus } from './projectMake'

const summarizeCommandOutput = (stdout: string, stderr: string): string => {
  const combinedOutput = [stdout.trim(), stderr.trim()].filter((value) => value.length > 0).join('\n')

  if (!combinedOutput) {
    return 'No build output was captured.'
  }

  const outputLines = combinedOutput.split(/\r?\n/)
  return outputLines.slice(-12).join('\n')
}

const shouldRunWithShell = (commandPath: string): boolean => {
  if (process.platform !== 'win32') {
    return false
  }

  const commandExtension = extname(commandPath).toLowerCase()
  return commandExtension === '.cmd' || commandExtension === '.bat'
}

const runCommand = async (
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  options?: { onOutputLine?: (line: string) => void }
): Promise<{ stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: shouldRunWithShell(command)
    })
    let stdout = ''
    let stderr = ''
    let stdoutRemainder = ''
    let stderrRemainder = ''

    const emitBufferedLines = (buffer: string, flushRemainder: boolean): string => {
      const normalizedBuffer = buffer.replace(/\r/g, '')
      const segments = normalizedBuffer.split('\n')
      const completeLines = flushRemainder ? segments : segments.slice(0, -1)
      const remainder = flushRemainder ? '' : (segments.at(-1) ?? '')

      for (const line of completeLines) {
        const trimmedLine = line.trim()

        if (trimmedLine.length > 0) {
          options?.onOutputLine?.(trimmedLine)
        }
      }

      return remainder
    }

    child.stdout.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString()
      stdout += text
      stdoutRemainder = emitBufferedLines(`${stdoutRemainder}${text}`, false)
    })

    child.stderr.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString()
      stderr += text
      stderrRemainder = emitBufferedLines(`${stderrRemainder}${text}`, false)
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (exitCode) => {
      stdoutRemainder = emitBufferedLines(stdoutRemainder, true)
      stderrRemainder = emitBufferedLines(stderrRemainder, true)

      if (exitCode === 0) {
        resolve({ stdout, stderr })
        return
      }

      reject(new Error(summarizeCommandOutput(stdout, stderr)))
    })
  })
}

type BuildProgressReporter = (payload: ProjectBuildProgressPayload) => void

const reportBuildProgress = (
  projectPath: string,
  stage: ProjectBuildProgressPayload['stage'],
  message: string,
  onProgress?: BuildProgressReporter
): void => {
  onProgress?.({
    projectPath,
    stage,
    message
  })
}

const findCompiledRomPath = async (projectPath: string): Promise<string | null> => {
  const objDirectoryPath = join(projectPath, 'obj')

  try {
    const entries = await readdir(objDirectoryPath, { withFileTypes: true })
    const romEntries = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.gb'))
        .map(async (entry) => {
          const absolutePath = join(objDirectoryPath, entry.name)
          const entryStats = await stat(absolutePath)

          return {
            absolutePath,
            modifiedAt: entryStats.mtimeMs
          }
        })
    )

    const latestRom = romEntries.sort((left, right) => right.modifiedAt - left.modifiedAt)[0]

    if (!latestRom) {
      return null
    }

    return relative(projectPath, latestRom.absolutePath).replace(/\\/g, '/')
  } catch {
    return null
  }
}

const revealCompiledRomInFileExplorer = (projectPath: string, romPath: string | null): void => {
  if (!romPath) {
    return
  }

  shell.showItemInFolder(join(projectPath, romPath))
}

const runMakeCommand = async (
  makeExecutablePath: string,
  args: string[],
  projectPath: string,
  gbdkHomePath: string,
  options?: { onOutputLine?: (line: string) => void }
): Promise<{ stdout: string; stderr: string }> => {
  return runCommand(makeExecutablePath, args, projectPath, {
    ...process.env,
    GBDK_HOME: gbdkHomePath
  }, options)
}

export const compileProject = async (
  projectPath: string,
  onProgress?: BuildProgressReporter
): Promise<CompileProjectResult> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  await ensureBundledGbdkAvailableForProject(normalizedProjectPath)

  const makeStatus = await getMakeToolchainStatus()

  if (!makeStatus.installed) {
    throw new ProjectLauncherError('GNU Make is not installed. Install it before compiling.')
  }

  const gbdkHomePath = join(dirname(normalizedProjectPath), 'gbdk')

  try {
    reportBuildProgress(normalizedProjectPath, 'clean', 'Running make clean...', onProgress)
    await runMakeCommand(makeStatus.executablePath, ['clean'], normalizedProjectPath, gbdkHomePath, {
      onOutputLine: (line) => {
        reportBuildProgress(normalizedProjectPath, 'clean', line, onProgress)
      }
    })
    reportBuildProgress(normalizedProjectPath, 'compile', 'Running make...', onProgress)
    const commandResult = await runMakeCommand(
      makeStatus.executablePath,
      [],
      normalizedProjectPath,
      gbdkHomePath,
      {
        onOutputLine: (line) => {
          reportBuildProgress(normalizedProjectPath, 'compile', line, onProgress)
        }
      }
    )

    return {
      romPath: await findCompiledRomPath(normalizedProjectPath),
      outputSummary: summarizeCommandOutput(commandResult.stdout, commandResult.stderr)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No build output was captured.'
    throw new ProjectLauncherError(`Project compilation failed.\n${message}`)
  }
}

export const buildAndCompileProject = async (
  projectPath: string,
  onProgress?: BuildProgressReporter
): Promise<BuildAndCompileProjectResult> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  reportBuildProgress(normalizedProjectPath, 'build', 'Generating project code...', onProgress)
  const buildResult = await buildProjectCode(normalizedProjectPath)
  const compileResult = await compileProject(normalizedProjectPath, onProgress)
  revealCompiledRomInFileExplorer(normalizedProjectPath, compileResult.romPath)

  return {
    buildResult,
    compileResult
  }
}
