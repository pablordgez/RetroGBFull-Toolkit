import {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { createPortal } from 'react-dom'
import './ContextMenuRegion.css'

export interface ContextMenuOption {
  id?: string
  label: string
  shortcutLabel?: string
  disabled?: boolean
  onSelect?: () => void
  children?: ContextMenuOption[]
}

interface ContextMenuRegionProps {
  options: ContextMenuOption[]
  children: ReactNode
  className?: string
  openOnClick?: boolean
}

interface MenuPosition {
  anchorLeft: number
  anchorTop: number
  left: number
  top: number
}

const HORIZONTAL_MENU_MARGIN = 2
const VERTICAL_MENU_MARGIN = 1

const buildClassName = (baseClassName: string, extraClassName?: string): string => {
  return extraClassName ? `${baseClassName} ${extraClassName}` : baseClassName
}

const hasChildren = (option: ContextMenuOption): boolean => {
  return Array.isArray(option.children) && option.children.length > 0
}

const buildOptionKey = (option: ContextMenuOption, index: number): string => {
  return option.id ?? `${option.label}-${index}`
}

interface ContextMenuListProps {
  options: ContextMenuOption[]
  onOptionSelect: (option: ContextMenuOption) => void
}

type SubmenuVerticalDirection = 'down' | 'up'
type SubmenuHorizontalDirection = 'right' | 'left'

interface ContextMenuItemProps {
  option: ContextMenuOption
  optionIndex: number
  onOptionSelect: (option: ContextMenuOption) => void
}

const ContextMenuItem = ({ option, optionIndex, onOptionSelect }: ContextMenuItemProps) => {
  const itemRef = useRef<HTMLDivElement>(null)
  const submenuRef = useRef<HTMLDivElement>(null)
  const [submenuVerticalDirection, setSubmenuVerticalDirection] =
    useState<SubmenuVerticalDirection>('down')
  const [submenuHorizontalDirection, setSubmenuHorizontalDirection] =
    useState<SubmenuHorizontalDirection>('right')
  const optionHasChildren = hasChildren(option)

  const updateSubmenuDirection = () => {
    if (!optionHasChildren || !submenuRef.current || !itemRef.current) {
      return
    }

    const itemBounds = itemRef.current.getBoundingClientRect()
    const submenuBounds = submenuRef.current.getBoundingClientRect()
    const canFitBelow =
      itemBounds.top + submenuBounds.height <= window.innerHeight - VERTICAL_MENU_MARGIN
    const canFitAbove = itemBounds.bottom - submenuBounds.height >= VERTICAL_MENU_MARGIN
    const canFitRight =
      itemBounds.right + submenuBounds.width <= window.innerWidth - HORIZONTAL_MENU_MARGIN
    const canFitLeft = itemBounds.left - submenuBounds.width >= HORIZONTAL_MENU_MARGIN

    setSubmenuVerticalDirection(!canFitBelow && canFitAbove ? 'up' : 'down')
    setSubmenuHorizontalDirection(!canFitRight && canFitLeft ? 'left' : 'right')
  }

  return (
    <div
      ref={itemRef}
      key={buildOptionKey(option, optionIndex)}
      className="context-menu-region__item"
      role="none"
      onMouseEnter={updateSubmenuDirection}
      onFocusCapture={updateSubmenuDirection}
    >
      <button
        type="button"
        className="context-menu-region__button"
        onClick={() => {
          if (!optionHasChildren && !option.disabled) {
            onOptionSelect(option)
          }
        }}
        disabled={option.disabled}
        role="menuitem"
        aria-haspopup={optionHasChildren ? 'menu' : undefined}
      >
        <span className="context-menu-region__content">
          <span>{option.label}</span>
          {option.shortcutLabel && (
            <span className="context-menu-region__shortcut" aria-hidden="true">
              {option.shortcutLabel}
            </span>
          )}
        </span>
        <span className="context-menu-region__affordance">
          {optionHasChildren && (
            <span className="context-menu-region__caret" aria-hidden="true">
              {'>'}
            </span>
          )}
        </span>
      </button>

      {optionHasChildren && option.children && (
        <div
          ref={submenuRef}
          className={buildClassName(
            'context-menu-region__submenu',
            [
              submenuVerticalDirection === 'up' ? 'context-menu-region__submenu--up' : '',
              submenuHorizontalDirection === 'left' ? 'context-menu-region__submenu--left' : ''
            ]
              .filter(Boolean)
              .join(' ')
          )}
          role="none"
        >
          <ContextMenuList options={option.children} onOptionSelect={onOptionSelect} />
        </div>
      )}
    </div>
  )
}

const ContextMenuList = ({ options, onOptionSelect }: ContextMenuListProps) => {
  return (
    <div className="context-menu-region__menu" role="menu">
      {options.map((option, index) => (
        <ContextMenuItem
          key={buildOptionKey(option, index)}
          option={option}
          optionIndex={index}
          onOptionSelect={onOptionSelect}
        />
      ))}
    </div>
  )
}

export const ContextMenuRegion = ({
  options,
  children,
  className,
  openOnClick = false
}: ContextMenuRegionProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)

  useEffect(() => {
    if (!menuPosition) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return
      }

      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuPosition(null)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuPosition(null)
      }
    }

    const handleWindowBlur = () => {
      setMenuPosition(null)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [menuPosition])

  useLayoutEffect(() => {
    if (!menuPosition || !menuRef.current) {
      return
    }

    const menuBounds = menuRef.current.getBoundingClientRect()
    const nextLeft = Math.min(
      menuPosition.anchorLeft,
      Math.max(
        HORIZONTAL_MENU_MARGIN,
        window.innerWidth - menuBounds.width - HORIZONTAL_MENU_MARGIN
      )
    )
    const nextTop =
      menuPosition.anchorTop + menuBounds.height + VERTICAL_MENU_MARGIN > window.innerHeight
        ? Math.max(VERTICAL_MENU_MARGIN, menuPosition.anchorTop - menuBounds.height)
        : Math.min(
            Math.max(menuPosition.anchorTop, VERTICAL_MENU_MARGIN),
            Math.max(
              VERTICAL_MENU_MARGIN,
              window.innerHeight - menuBounds.height - VERTICAL_MENU_MARGIN
            )
          )

    if (nextLeft !== menuPosition.left || nextTop !== menuPosition.top) {
      setMenuPosition({
        anchorLeft: menuPosition.anchorLeft,
        anchorTop: menuPosition.anchorTop,
        left: nextLeft,
        top: nextTop
      })
    }
  }, [menuPosition])

  const menuStyle = useMemo((): CSSProperties | undefined => {
    if (!menuPosition) {
      return undefined
    }

    return {
      left: `${menuPosition.left}px`,
      top: `${menuPosition.top}px`
    }
  }, [menuPosition])

  const handleOptionSelect = (option: ContextMenuOption) => {
    option.onSelect?.()
    setMenuPosition(null)
  }

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()

    setMenuPosition({
      anchorLeft: event.clientX,
      anchorTop: event.clientY,
      left: event.clientX,
      top: event.clientY
    })
  }

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!openOnClick) {
      return
    }

    const containerBounds = event.currentTarget.getBoundingClientRect()

    setMenuPosition({
      anchorLeft: containerBounds.left,
      anchorTop: containerBounds.bottom,
      left: containerBounds.left,
      top: containerBounds.bottom
    })
  }

  return (
    <div
      ref={containerRef}
      className={buildClassName('context-menu-region', className)}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {children}

      {menuPosition &&
        createPortal(
          <div ref={menuRef} className="context-menu-region__popup" style={menuStyle}>
            <ContextMenuList options={options} onOptionSelect={handleOptionSelect} />
          </div>,
          document.body
        )}
    </div>
  )
}
