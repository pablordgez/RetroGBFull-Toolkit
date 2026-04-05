import { PointerEvent as ReactPointerEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './ResizablePaneLayout.css'

type ResizeDirection = 'vertical' | 'horizontal'
type PanePosition = 'start' | 'end'

interface ResizablePaneLayoutProps {
  children?: ReactNode
  pane: ReactNode
  direction?: ResizeDirection
  panePosition?: PanePosition
  initialPaneSize?: number
  minPaneSize?: number
  maxPaneSizeRatio?: number
  resizeHandleLabel?: string
  className?: string
}

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max)
}

const buildClassName = (baseClassName: string, extraClassName?: string): string => {
  return extraClassName ? `${baseClassName} ${extraClassName}` : baseClassName
}

export const ResizablePaneLayout = ({
  children,
  pane,
  direction = 'vertical',
  panePosition = 'end',
  initialPaneSize = 220,
  minPaneSize = 140,
  maxPaneSizeRatio = 0.6,
  resizeHandleLabel = 'Resize pane',
  className
}: ResizablePaneLayoutProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const [paneSize, setPaneSize] = useState(initialPaneSize)

  const isVertical = direction === 'vertical'

  const clampPaneSize = useCallback(
    (nextPaneSize: number) => {
      const bounds = containerRef.current?.getBoundingClientRect()

      if (!bounds) {
        return
      }

      const containerSize = isVertical ? bounds.height : bounds.width
      const maxPaneSize = Math.max(minPaneSize, Math.round(containerSize * maxPaneSizeRatio))

      setPaneSize(Math.round(clamp(nextPaneSize, minPaneSize, maxPaneSize)))
    },
    [isVertical, maxPaneSizeRatio, minPaneSize]
  )

  const updatePaneSizeFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const bounds = containerRef.current?.getBoundingClientRect()

      if (!bounds) {
        return
      }

      if (isVertical) {
        const nextPaneSize =
          panePosition === 'end' ? bounds.bottom - clientY : clientY - bounds.top

        clampPaneSize(nextPaneSize)
        return
      }

      const nextPaneSize =
        panePosition === 'end' ? bounds.right - clientX : clientX - bounds.left

      clampPaneSize(nextPaneSize)
    },
    [clampPaneSize, isVertical, panePosition]
  )

  useEffect(() => {
    clampPaneSize(paneSize)
  }, [clampPaneSize, paneSize])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!isDraggingRef.current) {
        return
      }

      updatePaneSizeFromPointer(event.clientX, event.clientY)
    }

    const handlePointerUp = () => {
      if (!isDraggingRef.current) {
        return
      }

      isDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [updatePaneSizeFromPointer])

  useEffect(() => {
    const handleWindowResize = () => {
      clampPaneSize(paneSize)
    }

    window.addEventListener('resize', handleWindowResize)

    return () => {
      window.removeEventListener('resize', handleWindowResize)
    }
  }, [clampPaneSize, paneSize])

  const containerStyle = useMemo(() => {
    return {
      flexDirection: isVertical ? 'column' : 'row'
    } as const
  }, [isVertical])

  const contentStyle = useMemo(() => {
    return {
      order: panePosition === 'end' ? 0 : 2
    }
  }, [panePosition])

  const paneStyle = useMemo(() => {
    return isVertical
      ? {
          height: `${paneSize}px`,
          order: panePosition === 'end' ? 2 : 0
        }
      : {
          width: `${paneSize}px`,
          order: panePosition === 'end' ? 2 : 0
        }
  }, [isVertical, panePosition, paneSize])

  const handleStyle = useMemo(() => {
    return {
      order: 1
    }
  }, [])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    isDraggingRef.current = true
    document.body.style.cursor = isVertical ? 'ns-resize' : 'ew-resize'
    document.body.style.userSelect = 'none'
    updatePaneSizeFromPointer(event.clientX, event.clientY)
  }

  return (
    <div
      ref={containerRef}
      className={buildClassName(
        `resizable-pane-layout resizable-pane-layout--${direction}`,
        className
      )}
      style={containerStyle}
    >
      <div className="resizable-pane-layout__content" style={contentStyle}>
        {children}
      </div>

      <div
        className="resizable-pane-layout__handle"
        style={handleStyle}
        onPointerDown={handlePointerDown}
        role="separator"
        aria-label={resizeHandleLabel}
        aria-orientation={isVertical ? 'horizontal' : 'vertical'}
      >
        <span className="resizable-pane-layout__grip" />
      </div>

      <div className="resizable-pane-layout__pane" style={paneStyle}>
        {pane}
      </div>
    </div>
  )
}
