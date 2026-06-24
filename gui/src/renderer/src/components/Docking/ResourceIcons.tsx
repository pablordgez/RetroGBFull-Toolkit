import type { ReactElement } from 'react'

interface ResourceIconProps {
  className?: string
}

export const RetroFolderIcon = ({ className }: ResourceIconProps): ReactElement => {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      role="img"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3" y="10" width="26" height="17" fill="#8bac0f" />
      <rect x="5" y="7" width="9" height="4" fill="#9bbc0f" />
      <rect x="7" y="11" width="18" height="2" fill="#c4bebb" opacity="0.85" />
      <path d="M5 8h9v2h12v15H4V10h1V8Zm10 3h-2V9H6v2H5v13h20V11H15Z" fill="#0f380f" />
      <rect x="7" y="15" width="10" height="2" fill="#306230" />
      <rect x="7" y="18" width="14" height="2" fill="#306230" />
    </svg>
  )
}

export const RetroActorIcon = ({ className }: ResourceIconProps): ReactElement => {
  return (
    <svg className={className} viewBox="0 0 32 32" role="img" aria-hidden="true">
      <rect x="8" y="5" width="16" height="11" rx="5" fill="#c4bebb" />
      <path
        d="M13 9h2v2h-2V9Zm4 0h2v2h-2V9Zm-6 8h10v2H11v-2Zm2 3h6v2h2v5H11v-5h2v-2Z"
        fill="#306230"
      />
      <path
        d="M12 4h8v2h2v1h1v7h-1v2h-2v1h3v2h2v8H7v-8h2v-2h3v-1h-2v-2H9v-2H8V7h1V6h2V4Zm0 2v1h-2v7h2v2h8v-2h2V7h-2V6h-8Zm10 15h-2v-2h-8v2h-2v5h12v-5Z"
        fill="#0f380f"
      />
    </svg>
  )
}

export const RetroCollisionIcon = ({ className }: ResourceIconProps): ReactElement => {
  return (
    <svg className={className} viewBox="0 0 32 32" role="img" aria-hidden="true">
      <rect x="6" y="6" width="20" height="20" fill="#c4bebb" opacity="0.45" />
      <path d="M6 6h20v20H6V6Zm17 3H9v14h14V9Z" fill="#0f380f" />
      <path d="M9 13h14M13 9v14M19 9v14M9 19h14" stroke="#306230" strokeWidth="2" />
    </svg>
  )
}

export const RetroSceneIcon = ({ className }: ResourceIconProps): ReactElement => {
  return (
    <svg className={className} viewBox="0 0 32 32" role="img" aria-hidden="true">
      <rect x="4" y="5" width="24" height="22" fill="#c4bebb" />
      <path d="M4 5h24v22H4V5Zm21 3H7v16h18V8Z" fill="#0f380f" />
      <rect x="8" y="19" width="17" height="5" fill="#8bac0f" />
      <rect x="9" y="9" width="2" height="15" fill="#0f380f" />
      <rect x="11" y="9" width="4" height="2" fill="#0f380f" />
      <rect x="11" y="11" width="8" height="2" fill="#0f380f" />
      <rect x="11" y="13" width="12" height="2" fill="#0f380f" />
      <rect x="11" y="15" width="8" height="2" fill="#0f380f" />
      <rect x="11" y="17" width="4" height="2" fill="#0f380f" />
      <rect x="13" y="11" width="4" height="2" fill="#8bac0f" />
      <rect x="13" y="13" width="8" height="2" fill="#8bac0f" />
      <rect x="13" y="15" width="4" height="2" fill="#8bac0f" />
      <rect x="11" y="21" width="13" height="2" fill="#306230" />
    </svg>
  )
}

export const RetroSpriteIcon = ({ className }: ResourceIconProps): ReactElement => {
  return (
    <svg className={className} viewBox="0 0 32 32" role="img" aria-hidden="true">
      <rect x="4" y="4" width="24" height="24" fill="#c4bebb" />
      <path d="M4 4h24v24H4V4Zm21 3H7v18h18V7Z" fill="#0f380f" />
      <rect x="11" y="9" width="10" height="3" fill="#306230" />
      <rect x="9" y="12" width="14" height="8" fill="#306230" />
      <rect x="7" y="15" width="4" height="5" fill="#306230" />
      <rect x="21" y="15" width="4" height="5" fill="#306230" />
      <rect x="11" y="20" width="3" height="3" fill="#306230" />
      <rect x="18" y="20" width="3" height="3" fill="#306230" />
      <rect x="12" y="13" width="3" height="3" fill="#c4bebb" />
      <rect x="17" y="13" width="3" height="3" fill="#c4bebb" />
      <rect x="13" y="14" width="2" height="2" fill="#0f380f" />
      <rect x="17" y="14" width="2" height="2" fill="#0f380f" />
      <rect x="13" y="18" width="6" height="2" fill="#0f380f" />
      <rect x="10" y="8" width="3" height="2" fill="#0f380f" />
      <rect x="19" y="8" width="3" height="2" fill="#0f380f" />
    </svg>
  )
}

export const RetroTilesetIcon = ({ className }: ResourceIconProps): ReactElement => {
  return (
    <svg className={className} viewBox="0 0 32 32" role="img" aria-hidden="true">
      <rect x="4" y="4" width="24" height="24" fill="#c4bebb" />
      <path d="M4 4h24v24H4V4Zm21 3H7v18h18V7Z" fill="#0f380f" />
      <rect x="8" y="8" width="16" height="16" fill="#8bac0f" />
      <path d="M8 8h16v16H8V8Zm14 2H10v12h12V10Z" fill="#0f380f" />
      <rect x="10" y="10" width="12" height="12" fill="#0f380f" />
      <rect x="10" y="10" width="5" height="3" fill="#8bac0f" />
      <rect x="16" y="10" width="6" height="3" fill="#8bac0f" />
      <rect x="10" y="14" width="3" height="3" fill="#8bac0f" />
      <rect x="14" y="14" width="5" height="3" fill="#8bac0f" />
      <rect x="20" y="14" width="2" height="3" fill="#8bac0f" />
      <rect x="10" y="18" width="5" height="3" fill="#8bac0f" />
      <rect x="16" y="18" width="6" height="3" fill="#8bac0f" />
      <rect x="11" y="11" width="3" height="1" fill="#c4bebb" />
      <rect x="17" y="19" width="3" height="1" fill="#306230" />
    </svg>
  )
}

export const RetroTilemapIcon = ({ className }: ResourceIconProps): ReactElement => {
  return (
    <svg className={className} viewBox="0 0 32 32" role="img" aria-hidden="true">
      <rect x="4" y="4" width="24" height="24" fill="#c4bebb" />
      <path d="M4 4h24v24H4V4Zm21 3H7v18h18V7Z" fill="#0f380f" />
      <rect x="9" y="11" width="14" height="13" fill="#8bac0f" />
      <rect x="9" y="9" width="3" height="4" fill="#8bac0f" />
      <rect x="15" y="9" width="3" height="4" fill="#8bac0f" />
      <rect x="21" y="9" width="3" height="4" fill="#8bac0f" />
      <path
        d="M9 9h3v2h3V9h3v2h3V9h3v15H9V9Zm12 5H11v8h10v-8Z"
        fill="#0f380f"
      />
      <rect x="11" y="13" width="10" height="10" fill="#8bac0f" />
      <rect x="13" y="15" width="2" height="3" fill="#c4bebb" />
      <rect x="17" y="15" width="2" height="3" fill="#c4bebb" />
      <rect x="14" y="20" width="4" height="3" fill="#306230" />
      <rect x="10" y="22" width="12" height="2" fill="#306230" />
    </svg>
  )
}

export const RetroWindowIcon = ({ className }: ResourceIconProps): ReactElement => {
  return (
    <svg className={className} viewBox="0 0 32 32" role="img" aria-hidden="true">
      <rect x="4" y="6" width="24" height="20" fill="#c4bebb" />
      <path d="M4 6h24v20H4V6Zm21 3H7v14h18V9Z" fill="#0f380f" />
      <rect x="7" y="9" width="18" height="5" fill="#8bac0f" />
      <rect x="7" y="18" width="18" height="5" fill="#306230" />
      <rect x="7" y="14" width="18" height="4" fill="#c4bebb" />
      <path d="M7 14h18v1H7v-1Zm0 3h18v1H7v-1Z" fill="#0f380f" opacity="0.65" />
    </svg>
  )
}

export const RetroMusicIcon = ({ className }: ResourceIconProps): ReactElement => {
  return (
    <svg className={className} viewBox="0 0 32 32" role="img" aria-hidden="true">
      <rect x="5" y="5" width="22" height="22" fill="#c4bebb" />
      <path d="M5 5h22v22H5V5Zm19 3H8v16h16V8Z" fill="#0f380f" />
      <path d="M17 10h6v2h-4v8h-2V10Z" fill="#0f380f" />
      <rect x="19" y="12" width="4" height="2" fill="#306230" />
      <rect x="17" y="12" width="2" height="8" fill="#306230" />
      <rect x="12" y="18" width="6" height="2" fill="#0f380f" />
      <rect x="10" y="20" width="8" height="3" fill="#0f380f" />
      <rect x="12" y="23" width="4" height="1" fill="#0f380f" />
      <rect x="12" y="19" width="5" height="3" fill="#8bac0f" />
    </svg>
  )
}

export const RetroFileIcon = ({ className }: ResourceIconProps): ReactElement => {
  return (
    <svg className={className} viewBox="0 0 32 32" role="img" aria-hidden="true">
      <path d="M7 4h13l5 5v19H7V4Zm11 2H9v20h14V11h-5V6Z" fill="#0f380f" />
      <path d="M18 4v7h7" fill="#9bbc0f" />
      <path d="M18 4v7h7" stroke="#0f380f" strokeWidth="2" />
      <rect x="11" y="14" width="10" height="2" fill="#306230" />
      <rect x="11" y="18" width="8" height="2" fill="#306230" />
    </svg>
  )
}

export const RetroBackIcon = ({ className }: ResourceIconProps): ReactElement => {
  return (
    <svg className={className} viewBox="0 0 32 32" role="img" aria-hidden="true">
      <path
        d="M13 3 4 13h5v5c0 6 5 10 12 10h6v-7h-6c-3 0-5-1-5-4v-4h5L13 3Z"
        fill="#0f380f"
      />
      <path
        d="M13 7 8 12h4v6c0 5 4 7 9 7h3v-2h-3c-4 0-7-2-7-6v-5h3l-4-5Z"
        fill="#9bbc0f"
      />
      <path d="M15 14h2v3c0 2 1 3 4 3h3v2h-3c-4 0-6-2-6-5v-3Z" fill="#306230" />
    </svg>
  )
}
