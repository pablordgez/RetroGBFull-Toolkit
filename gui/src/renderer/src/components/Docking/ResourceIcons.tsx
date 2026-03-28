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

export const RetroSceneIcon = ({ className }: ResourceIconProps): ReactElement => {
  return (
    <svg className={className} viewBox="0 0 32 32" role="img" aria-hidden="true">
      <rect x="4" y="5" width="24" height="22" fill="#c4bebb" />
      <path d="M4 5h24v22H4V5Zm21 3H7v16h18V8Z" fill="#0f380f" />
      <rect x="8" y="10" width="6" height="4" fill="#8bac0f" />
      <rect x="18" y="10" width="6" height="4" fill="#8bac0f" />
      <rect x="13" y="18" width="6" height="4" fill="#306230" />
      <path d="M14 12h4v2h-2v4h-2v-6Zm4 8h2v2h-8v-2h6Zm4-6h2v6h-2v-6Z" fill="#306230" />
    </svg>
  )
}

export const RetroSpriteIcon = ({ className }: ResourceIconProps): ReactElement => {
  return (
    <svg className={className} viewBox="0 0 32 32" role="img" aria-hidden="true">
      <rect x="4" y="4" width="24" height="24" fill="#c4bebb" />
      <path d="M4 4h24v24H4V4Zm21 3H7v18h18V7Z" fill="#0f380f" />
      <rect x="8" y="8" width="4" height="4" fill="#306230" />
      <rect x="12" y="8" width="4" height="4" fill="#8bac0f" />
      <rect x="16" y="8" width="4" height="4" fill="#306230" />
      <rect x="20" y="8" width="4" height="4" fill="#8bac0f" />
      <rect x="8" y="12" width="4" height="4" fill="#8bac0f" />
      <rect x="12" y="12" width="4" height="4" fill="#0f380f" />
      <rect x="16" y="12" width="4" height="4" fill="#0f380f" />
      <rect x="20" y="12" width="4" height="4" fill="#8bac0f" />
      <rect x="8" y="16" width="4" height="4" fill="#306230" />
      <rect x="12" y="16" width="4" height="4" fill="#8bac0f" />
      <rect x="16" y="16" width="4" height="4" fill="#8bac0f" />
      <rect x="20" y="16" width="4" height="4" fill="#306230" />
      <rect x="8" y="20" width="4" height="4" fill="#8bac0f" />
      <rect x="12" y="20" width="4" height="4" fill="#306230" />
      <rect x="16" y="20" width="4" height="4" fill="#306230" />
      <rect x="20" y="20" width="4" height="4" fill="#8bac0f" />
    </svg>
  )
}

export const RetroTilesetIcon = ({ className }: ResourceIconProps): ReactElement => {
  return (
    <svg className={className} viewBox="0 0 32 32" role="img" aria-hidden="true">
      <rect x="4" y="4" width="24" height="24" fill="#c4bebb" />
      <path d="M4 4h24v24H4V4Zm21 3H7v18h18V7Z" fill="#0f380f" />
      <path
        d="M7 13h18M7 19h18M13 7v18M19 7v18"
        stroke="#0f380f"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      <rect x="8" y="8" width="4" height="4" fill="#8bac0f" />
      <rect x="14" y="8" width="4" height="4" fill="#306230" />
      <rect x="20" y="8" width="4" height="4" fill="#8bac0f" />
      <rect x="8" y="14" width="4" height="4" fill="#306230" />
      <rect x="14" y="14" width="4" height="4" fill="#8bac0f" />
      <rect x="20" y="14" width="4" height="4" fill="#306230" />
      <rect x="8" y="20" width="4" height="4" fill="#8bac0f" />
      <rect x="14" y="20" width="4" height="4" fill="#306230" />
      <rect x="20" y="20" width="4" height="4" fill="#8bac0f" />
    </svg>
  )
}

export const RetroTilemapIcon = ({ className }: ResourceIconProps): ReactElement => {
  return (
    <svg className={className} viewBox="0 0 32 32" role="img" aria-hidden="true">
      <rect x="4" y="4" width="24" height="24" fill="#c4bebb" />
      <path d="M4 4h24v24H4V4Zm21 3H7v18h18V7Z" fill="#0f380f" />
      <path d="M7 13h18M7 19h18M13 7v18M19 7v18" stroke="#306230" strokeWidth="2" />
      <rect x="7" y="7" width="6" height="6" fill="#8bac0f" />
      <rect x="13" y="13" width="6" height="6" fill="#306230" />
      <rect x="19" y="19" width="6" height="6" fill="#8bac0f" />
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
