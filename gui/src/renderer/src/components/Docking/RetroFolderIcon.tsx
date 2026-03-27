interface RetroFolderIconProps {
  className?: string
}

export const RetroFolderIcon = ({ className }: RetroFolderIconProps) => {
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
      <path
        d="M5 8h9v2h12v15H4V10h1V8Zm10 3h-2V9H6v2H5v13h20V11H15Z"
        fill="#0f380f"
      />
      <rect x="7" y="15" width="10" height="2" fill="#306230" />
      <rect x="7" y="18" width="14" height="2" fill="#306230" />
    </svg>
  )
}
