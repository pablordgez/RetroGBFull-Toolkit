import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AnimationControls } from '../../../src/renderer/src/components/SpriteEditor/AnimationControls'

describe('<AnimationControls />', () => {
  it('disables navigation at the frame boundaries and while playing', () => {
    const onSetFrame = vi.fn()

    const { rerender } = render(
      <AnimationControls
        currentFrame={0}
        totalFrames={3}
        fps={12}
        isPlaying={false}
        onSetFrame={onSetFrame}
        onAddFrame={() => undefined}
        onDeleteFrame={() => undefined}
        onTogglePlay={() => undefined}
        onFpsChange={() => undefined}
      />
    )

    const buttons = screen.getAllByRole('button')
    expect(buttons[0]).toBeDisabled()
    expect(buttons[1]).not.toBeDisabled()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()

    fireEvent.click(buttons[1])
    expect(onSetFrame).toHaveBeenCalledWith(1)

    rerender(
      <AnimationControls
        currentFrame={2}
        totalFrames={3}
        fps={12}
        isPlaying
        onSetFrame={onSetFrame}
        onAddFrame={() => undefined}
        onDeleteFrame={() => undefined}
        onTogglePlay={() => undefined}
        onFpsChange={() => undefined}
      />
    )

    const playingButtons = screen.getAllByRole('button')
    expect(playingButtons[0]).toBeDisabled()
    expect(playingButtons[1]).toBeDisabled()
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
  })

  it('dispatches add, delete, play, and fps change actions', () => {
    const onAddFrame = vi.fn()
    const onDeleteFrame = vi.fn()
    const onTogglePlay = vi.fn()
    const onFpsChange = vi.fn()

    render(
      <AnimationControls
        currentFrame={1}
        totalFrames={1}
        fps={8}
        isPlaying={false}
        onSetFrame={() => undefined}
        onAddFrame={onAddFrame}
        onDeleteFrame={onDeleteFrame}
        onTogglePlay={onTogglePlay}
        onFpsChange={onFpsChange}
      />
    )

    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[2])
    expect(onAddFrame).toHaveBeenCalledTimes(1)

    expect(buttons[3]).toBeDisabled()
    fireEvent.click(buttons[4])
    expect(onTogglePlay).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '24' } })
    expect(onFpsChange).toHaveBeenCalledWith(24)
  })
})
