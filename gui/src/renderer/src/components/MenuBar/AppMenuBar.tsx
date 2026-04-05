import { MouseEvent as ReactMouseEvent, useEffect, useMemo, useState } from 'react'
import './AppMenuBar.css'

export interface AppMenuItem {
  id?: string
  label: string
  disabled?: boolean
  onSelect?: () => void
  children?: AppMenuItem[]
}

export interface AppMenuDefinition {
  id?: string
  label: string
  disabled?: boolean
  items: AppMenuItem[]
  onOpen?: () => void
}

interface AppMenuBarProps {
  menus: AppMenuDefinition[]
  className?: string
}

const buildClassName = (baseClassName: string, extraClassName?: string): string => {
  return extraClassName ? `${baseClassName} ${extraClassName}` : baseClassName
}

const hasChildren = (item: AppMenuItem): boolean => {
  return Array.isArray(item.children) && item.children.length > 0
}

const buildItemKey = (item: AppMenuItem, index: number): string => {
  return item.id ?? `${item.label}-${index}`
}

interface AppMenuListProps {
  items: AppMenuItem[]
  onItemSelect: (item: AppMenuItem) => void
}

interface AppMenuItemEntryProps {
  item: AppMenuItem
  onItemSelect: (item: AppMenuItem) => void
}

const AppMenuItemEntry = ({ item, onItemSelect }: AppMenuItemEntryProps) => {
  const itemHasChildren = hasChildren(item)

  return (
    <div className="app-menu-bar__item" role="none">
      <button
        type="button"
        className="app-menu-bar__item-button"
        disabled={item.disabled}
        role="menuitem"
        aria-haspopup={itemHasChildren ? 'menu' : undefined}
        onClick={() => {
          if (!itemHasChildren && !item.disabled) {
            onItemSelect(item)
          }
        }}
      >
        <span>{item.label}</span>
        {itemHasChildren && (
          <span className="app-menu-bar__caret" aria-hidden="true">
            {'>'}
          </span>
        )}
      </button>

      {itemHasChildren && item.children && (
        <div className="app-menu-bar__submenu" role="none">
          <AppMenuList items={item.children} onItemSelect={onItemSelect} />
        </div>
      )}
    </div>
  )
}

const AppMenuList = ({ items, onItemSelect }: AppMenuListProps) => {
  return (
    <div className="app-menu-bar__menu" role="menu">
      {items.map((item, index) => (
        <AppMenuItemEntry
          key={buildItemKey(item, index)}
          item={item}
          onItemSelect={onItemSelect}
        />
      ))}
    </div>
  )
}

export const AppMenuBar = ({ menus, className }: AppMenuBarProps) => {
  const [activeMenuIndex, setActiveMenuIndex] = useState<number | null>(null)

  useEffect(() => {
    if (activeMenuIndex === null) {
      return
    }

    const activeMenu = menus[activeMenuIndex]
    activeMenu?.onOpen?.()
  }, [activeMenuIndex, menus])

  useEffect(() => {
    if (activeMenuIndex === null) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        return
      }

      const targetElement = event.target as HTMLElement

      if (!targetElement.closest('.app-menu-bar')) {
        setActiveMenuIndex(null)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveMenuIndex(null)
      }
    }

    const handleWindowBlur = () => {
      setActiveMenuIndex(null)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [activeMenuIndex])

  const handleItemSelect = (item: AppMenuItem) => {
    item.onSelect?.()
    setActiveMenuIndex(null)
  }

  const activeMenu = useMemo(() => {
    if (activeMenuIndex === null) {
      return null
    }

    return menus[activeMenuIndex] ?? null
  }, [activeMenuIndex, menus])

  return (
    <div className={buildClassName('app-menu-bar', className)} role="menubar">
      {menus.map((menu, index) => {
        const isActive = activeMenuIndex === index

        return (
          <div
            key={menu.id ?? `${menu.label}-${index}`}
            className="app-menu-bar__top-item"
            onMouseEnter={() => {
              if (activeMenuIndex !== null && !menu.disabled) {
                setActiveMenuIndex(index)
              }
            }}
          >
            <button
              type="button"
              className={`app-menu-bar__top-button${isActive ? ' app-menu-bar__top-button--active' : ''}`}
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={isActive}
              disabled={menu.disabled}
              onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                event.preventDefault()
                setActiveMenuIndex((currentIndex) => (currentIndex === index ? null : index))
              }}
            >
              {menu.label}
            </button>

            {isActive && activeMenu && (
              <div className="app-menu-bar__dropdown" role="none">
                <AppMenuList items={activeMenu.items} onItemSelect={handleItemSelect} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
