import './MakeSetupGuideModal.css'
import type { MakeToolchainStatus } from '../../../../shared/projectMake'
import type { RuntimePlatform } from '../../../../shared/runtimePlatform'

interface MakeSetupGuideModalProps {
  platform: RuntimePlatform
  status: MakeToolchainStatus | null
  isRefreshing: boolean
  onRefresh: () => void
  onClose: () => void
}

interface GuideStep {
  title: string
  body: string
  commands?: Array<{
    label: string
    command: string
  }>
  note?: string
}

interface GuideDefinition {
  platformLabel: string
  summary: string
  callout?: string
  steps: GuideStep[]
}

const getGuideDefinition = (platform: RuntimePlatform): GuideDefinition => {
  if (platform === 'win32') {
    return {
      platformLabel: 'Windows',
      summary: 'GNU Make is usually not installed on Windows.',
      callout: 'The built-in installer still needs a compiler toolchain.',
      steps: [
        {
          title: 'Open Terminal',
          body: 'Open Windows Terminal or PowerShell.'
        },
        {
          title: 'Install It',
          body: 'Run this command:',
          commands: [
            {
              label: 'WinGet',
              command: 'winget install --id ezwinports.make -e'
            }
          ],
          note: 'If WinGet is missing, install App Installer first.'
        },
        {
          title: 'Check It',
          body: 'Open a new terminal, then run:',
          commands: [
            {
              label: 'Verify',
              command: 'make --version'
            }
          ],
          note: 'The app also detects gnumake.exe and mingw32-make.exe.'
        },
        {
          title: 'Recheck Here',
          body: 'If it works, press Check Again.'
        }
      ]
    }
  }

  if (platform === 'darwin') {
    return {
      platformLabel: 'macOS',
      summary: 'GNU Make usually comes from Apple tools or Homebrew.',
      steps: [
        {
          title: 'Install Apple Tools',
          body: 'Run this first:',
          commands: [
            {
              label: 'Apple CLT',
              command: 'xcode-select --install'
            }
          ]
        },
        {
          title: 'Check It',
          body: 'When it finishes, run:',
          commands: [
            {
              label: 'Verify',
              command: 'make --version'
            }
          ]
        },
        {
          title: 'Homebrew Option',
          body: 'If you use Homebrew, run:',
          commands: [
            {
              label: 'Homebrew',
              command: 'brew install make'
            }
          ],
          note: 'Homebrew may expose GNU Make as gmake.'
        },
        {
          title: 'Recheck Here',
          body: 'If make or gmake works, press Check Again.'
        }
      ]
    }
  }

  if (platform === 'linux') {
    return {
      platformLabel: 'Linux',
      summary: 'GNU Make is common on Linux, but not always installed.',
      steps: [
        {
          title: 'Install It',
          body: 'Run the command for your distro:',
          commands: [
            {
              label: 'Debian / Ubuntu',
              command: 'sudo apt update && sudo apt install -y make'
            },
            {
              label: 'Fedora / RHEL',
              command: 'sudo dnf install -y make'
            },
            {
              label: 'Arch',
              command: 'sudo pacman -S make'
            }
          ],
          note: 'Some systems use gmake, but make is more common.'
        },
        {
          title: 'Check It',
          body: 'Then run:',
          commands: [
            {
              label: 'Verify make',
              command: 'make --version'
            },
            {
              label: 'Verify gmake',
              command: 'gmake --version'
            }
          ]
        },
        {
          title: 'Recheck Here',
          body: 'If one works, press Check Again.'
        }
      ]
    }
  }

  return {
    platformLabel: 'This system',
    summary: 'This system could not be identified.',
    steps: [
      {
        title: 'Install GNU Make',
        body: 'Use your system package manager or developer tools.'
      },
      {
        title: 'Check It',
        body: 'Then run:',
        commands: [
          {
            label: 'Verify',
            command: 'make --version'
          }
        ]
      },
      {
        title: 'Recheck Here',
        body: 'If it works, press Check Again.'
      }
    ]
  }
}

const getStatusLabel = (status: MakeToolchainStatus | null): string => {
  if (!status) {
    return 'Checking'
  }

  return status.installed ? 'Ready' : 'Missing'
}

const getFooterStatusText = (status: MakeToolchainStatus | null): string => {
  if (!status) {
    return 'Checking...'
  }

  if (status.installed) {
    return status.version ? `Ready · ${status.version}` : 'Ready'
  }

  return 'Missing'
}

export const MakeSetupGuideModal = ({
  platform,
  status,
  isRefreshing,
  onRefresh,
  onClose
}: MakeSetupGuideModalProps) => {
  const guide = getGuideDefinition(platform)

  return (
    <div className="make-setup-guide__backdrop" onClick={onClose}>
      <div
        className="make-setup-guide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="make-setup-guide-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="make-setup-guide__hero">
          <div className="make-setup-guide__heading">
            <p className="make-setup-guide__eyebrow">Toolchain Setup</p>
            <h2 id="make-setup-guide-title">GNU Make Setup Guide</h2>
            <p className="make-setup-guide__summary">{guide.summary}</p>
          </div>

          <div className="make-setup-guide__status-card">
            <span className="make-setup-guide__platform">{guide.platformLabel}</span>
            <strong>{getStatusLabel(status)}</strong>
            <span>{status?.executablePath ?? status?.installPath ?? 'Checking toolchain status...'}</span>
            {status?.version && <span>Version {status.version}</span>}
          </div>
        </div>

        {guide.callout && <div className="make-setup-guide__callout">{guide.callout}</div>}

        <ol className="make-setup-guide__steps">
          {guide.steps.map((step, index) => (
            <li key={`${step.title}-${index}`} className="make-setup-guide__step">
              <div className="make-setup-guide__step-index" aria-hidden="true">
                {index + 1}
              </div>
              <div className="make-setup-guide__step-body">
                <h3>{step.title}</h3>
                <p>{step.body}</p>

                {step.commands && (
                  <div className="make-setup-guide__command-list">
                    {step.commands.map((command) => (
                      <div key={`${step.title}-${command.label}`} className="make-setup-guide__command-card">
                        <span>{command.label}</span>
                        <code>{command.command}</code>
                      </div>
                    ))}
                  </div>
                )}

                {step.note && <p className="make-setup-guide__note">{step.note}</p>}
              </div>
            </li>
          ))}
        </ol>

        <div className="make-setup-guide__footer">
          <div className="make-setup-guide__footer-copy">
            <strong>Current status</strong>
            <span>{getFooterStatusText(status)}</span>
          </div>

          <div className="make-setup-guide__actions">
            <button type="button" onClick={onClose}>
              Close
            </button>
            <button type="button" onClick={onRefresh} disabled={isRefreshing}>
              {isRefreshing ? 'Checking GNU Make...' : 'Check Again'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
