import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MakeSetupGuideModal } from '../../../src/renderer/src/components/Toolchains/MakeSetupGuideModal'

describe('<MakeSetupGuideModal />', () => {
  it('renders the Windows setup flow, status copy, and button actions', () => {
    const onRefresh = vi.fn()
    const onClose = vi.fn()

    render(
      <MakeSetupGuideModal
        platform="win32"
        status={{
          installed: false,
          installPath: 'C:\\toolchains\\make',
          executablePath: 'C:\\toolchains\\make\\bin\\make.exe',
          version: null,
          source: 'runtime-managed',
          message: 'Missing'
        }}
        isRefreshing={false}
        onRefresh={onRefresh}
        onClose={onClose}
      />
    )

    expect(screen.getByText('GNU Make Setup Guide')).toBeInTheDocument()
    expect(screen.getByText('GNU Make is usually not installed on Windows.')).toBeInTheDocument()
    expect(screen.getByText('The built-in installer still needs a compiler toolchain.')).toBeInTheDocument()
    expect(screen.getByText('winget install --id ezwinports.make -e')).toBeInTheDocument()
    expect(screen.getAllByText('Missing')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Check Again' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(document.querySelector('.make-setup-guide__backdrop')!)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('renders platform-specific steps for macOS, Linux, and unknown platforms', () => {
    const { rerender } = render(
      <MakeSetupGuideModal
        platform="darwin"
        status={{
          installed: true,
          installPath: '/toolchains/make',
          executablePath: '/toolchains/make/bin/gmake',
          version: '4.4.1',
          source: 'runtime-managed',
          message: 'Ready'
        }}
        isRefreshing={false}
        onRefresh={() => undefined}
        onClose={() => undefined}
      />
    )

    expect(screen.getByText('GNU Make usually comes from Apple tools or Homebrew.')).toBeInTheDocument()
    expect(screen.getByText('xcode-select --install')).toBeInTheDocument()
    expect(screen.getByText('brew install make')).toBeInTheDocument()
    expect(screen.getAllByText('Ready').length).toBeGreaterThan(0)
    expect(screen.getByText('Version 4.4.1')).toBeInTheDocument()

    rerender(
      <MakeSetupGuideModal
        platform="linux"
        status={{
          installed: false,
          installPath: '/toolchains/make',
          executablePath: '/toolchains/make/bin/make',
          version: null,
          source: 'runtime-managed',
          message: 'Missing'
        }}
        isRefreshing
        onRefresh={() => undefined}
        onClose={() => undefined}
      />
    )

    expect(screen.getByText('GNU Make is common on Linux, but not always installed.')).toBeInTheDocument()
    expect(screen.getByText('sudo apt update && sudo apt install -y make')).toBeInTheDocument()
    expect(screen.getByText('sudo dnf install -y make')).toBeInTheDocument()
    expect(screen.getByText('sudo pacman -S make')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Checking GNU Make...' })).toBeDisabled()

    rerender(
      <MakeSetupGuideModal
        platform="unknown"
        status={null}
        isRefreshing={false}
        onRefresh={() => undefined}
        onClose={() => undefined}
      />
    )

    expect(screen.getByText('This system could not be identified.')).toBeInTheDocument()
    expect(screen.getByText('Use your system package manager or developer tools.')).toBeInTheDocument()
    expect(screen.getAllByText('Checking').length).toBeGreaterThan(0)
    expect(screen.getByText('Checking toolchain status...')).toBeInTheDocument()
    expect(screen.getByText('Checking...')).toBeInTheDocument()
  })
})
