import type {
  SpriteAssetDocument,
  TilemapAssetDocument,
  TilesetAssetDocument,
  WindowAssetDocument
} from '../../../../shared/projectAssets'

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16)
  }
}

export const renderIndexedBitmapToDataUrl = (
  pixels: number[],
  width: number,
  height: number,
  palette: string[]
): string => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context) {
    return ''
  }

  const imageData = context.createImageData(width, height)

  for (let index = 0; index < pixels.length; index += 1) {
    const colorIndex = pixels[index]
    const hex = palette[colorIndex] ?? '#000000'
    const { r, g, b } = hexToRgb(hex)
    const dataIndex = index * 4

    imageData.data[dataIndex] = r
    imageData.data[dataIndex + 1] = g
    imageData.data[dataIndex + 2] = b
    imageData.data[dataIndex + 3] = 255
  }

  context.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

export const renderSpriteDocumentPreview = (document: SpriteAssetDocument): string => {
  return renderIndexedBitmapToDataUrl(
    document.frames[document.currentFrame] ?? document.frames[0] ?? [],
    document.width,
    document.height,
    document.palette
  )
}

export const drawTilemapToCanvas = (
  canvas: HTMLCanvasElement,
  tilemap: TilemapAssetDocument,
  tileset: TilesetAssetDocument
): void => {
  const context = canvas.getContext('2d')

  if (!context) {
    return
  }

  const width = tilemap.width * 8
  const height = tilemap.height * 8
  canvas.width = width
  canvas.height = height
  context.clearRect(0, 0, width, height)

  for (let tileY = 0; tileY < tilemap.height; tileY += 1) {
    for (let tileX = 0; tileX < tilemap.width; tileX += 1) {
      const tileIndex = tilemap.grid[tileY * tilemap.width + tileX] ?? 0
      const tilePixels = tileset.tiles[tileIndex]

      if (!tilePixels) {
        continue
      }

      const imageData = context.createImageData(8, 8)

      for (let pixelIndex = 0; pixelIndex < tilePixels.length; pixelIndex += 1) {
        const paletteIndex = tilePixels[pixelIndex]
        const hex = tileset.palette[paletteIndex] ?? '#000000'
        const { r, g, b } = hexToRgb(hex)
        const dataIndex = pixelIndex * 4

        imageData.data[dataIndex] = r
        imageData.data[dataIndex + 1] = g
        imageData.data[dataIndex + 2] = b
        imageData.data[dataIndex + 3] = 255
      }

      context.putImageData(imageData, tileX * 8, tileY * 8)
    }
  }
}

export const drawWindowToCanvas = (
  canvas: HTMLCanvasElement,
  windowDocument: WindowAssetDocument,
  tileset: TilesetAssetDocument
): void => {
  const context = canvas.getContext('2d')

  if (!context) {
    return
  }

  canvas.width = 160
  canvas.height = 144
  context.clearRect(0, 0, canvas.width, canvas.height)

  const drawTile = (tileX: number, tileY: number, destinationTileY: number): void => {
    if (tileX >= 20 || destinationTileY >= 18) {
      return
    }

    const tileIndex = windowDocument.grid[tileY * windowDocument.width + tileX] ?? 0
    const tilePixels = tileset.tiles[tileIndex]

    if (!tilePixels) {
      return
    }

    const imageData = context.createImageData(8, 8)

    for (let pixelIndex = 0; pixelIndex < tilePixels.length; pixelIndex += 1) {
      const paletteIndex = tilePixels[pixelIndex]
      const hex = tileset.palette[paletteIndex] ?? '#000000'
      const { r, g, b } = hexToRgb(hex)
      const dataIndex = pixelIndex * 4

      imageData.data[dataIndex] = r
      imageData.data[dataIndex + 1] = g
      imageData.data[dataIndex + 2] = b
      imageData.data[dataIndex + 3] = 255
    }

    context.putImageData(imageData, tileX * 8, destinationTileY * 8)
  }

  for (let tileY = 0; tileY < windowDocument.height; tileY += 1) {
    const isFullWindow = windowDocument.windowTopEnd === 0
    const isTopWindowRow = windowDocument.windowTopEnd > 0 && tileY < windowDocument.windowTopEnd
    const isBottomWindowRow =
      windowDocument.windowTopEnd > 0 &&
      windowDocument.windowBottomStart > windowDocument.windowTopEnd &&
      tileY >= windowDocument.windowBottomStart

    if (!isFullWindow && !isTopWindowRow && !isBottomWindowRow) {
      continue
    }

    for (let tileX = 0; tileX < windowDocument.width; tileX += 1) {
      drawTile(tileX, tileY, tileY)
    }
  }
}
