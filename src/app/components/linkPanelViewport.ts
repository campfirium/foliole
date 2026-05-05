import type { LinkPanelSize } from './linkPanelPreferences';

export interface LinkPanelPosition {
  x: number;
  y: number;
}

export interface LinkPanelViewportBounds {
  left: number;
  top: number;
  windowHeight: number;
  windowWidth: number;
}

const VIEWPORT_MARGIN = 16;
const STACK_OFFSET_X = 28;
const STACK_OFFSET_Y = 28;

function getDefaultBounds(): LinkPanelViewportBounds {
  return {
    left: 0,
    top: 0,
    windowHeight: typeof window === 'undefined' ? 900 : window.innerHeight,
    windowWidth: typeof window === 'undefined' ? 1440 : window.innerWidth
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function fitLinkPanelSizeToBounds(
  size: LinkPanelSize,
  bounds: LinkPanelViewportBounds = getDefaultBounds()
): LinkPanelSize {
  return {
    height: Math.min(size.height, Math.max(240, bounds.windowHeight - VIEWPORT_MARGIN * 2)),
    width: Math.min(size.width, Math.max(280, bounds.windowWidth - VIEWPORT_MARGIN * 2))
  };
}

export function clampLinkPanelPosition(
  position: LinkPanelPosition,
  size: LinkPanelSize,
  bounds: LinkPanelViewportBounds = getDefaultBounds()
): LinkPanelPosition {
  const minX = VIEWPORT_MARGIN;
  const minY = VIEWPORT_MARGIN;
  const maxX = Math.max(minX, bounds.windowWidth - size.width - VIEWPORT_MARGIN);
  const maxY = Math.max(minY, bounds.windowHeight - size.height - VIEWPORT_MARGIN);
  return {
    x: clamp(Math.round(position.x), minX, maxX),
    y: clamp(Math.round(position.y), minY, maxY)
  };
}

export function createInitialLinkPanelPosition(
  index: number,
  size: LinkPanelSize,
  bounds: LinkPanelViewportBounds = getDefaultBounds()
): LinkPanelPosition {
  return createAnchoredLinkPanelPosition(index, size, bounds);
}

export function createAnchoredLinkPanelPosition(
  index: number,
  size: LinkPanelSize,
  bounds: LinkPanelViewportBounds = getDefaultBounds(),
  anchorPoint?: { x: number; y: number }
): LinkPanelPosition {
  const fittedSize = fitLinkPanelSizeToBounds(size, bounds);
  const leftSideX = VIEWPORT_MARGIN + index * STACK_OFFSET_X;
  const rightSideX = bounds.windowWidth - fittedSize.width - VIEWPORT_MARGIN - index * STACK_OFFSET_X;
  const topY = bounds.top + VIEWPORT_MARGIN + index * STACK_OFFSET_Y;
  if (!anchorPoint) {
    return clampLinkPanelPosition(
      {
        x: rightSideX,
        y: topY
      },
      fittedSize,
      bounds
    );
  }

  const preferRight = anchorPoint.x < bounds.windowWidth / 2;
  return clampLinkPanelPosition(
    {
      x: preferRight ? rightSideX : leftSideX,
      y: topY
    },
    fittedSize,
    bounds
  );
}
