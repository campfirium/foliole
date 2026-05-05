import { describe, expect, it } from 'vitest';

import type { LinkPanelSize } from './linkPanelPreferences';
import {
  clampLinkPanelPosition,
  createAnchoredLinkPanelPosition,
  createInitialLinkPanelPosition,
  fitLinkPanelSizeToBounds,
  type LinkPanelViewportBounds
} from './linkPanelViewport';

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

function createBounds(width: number, height: number): LinkPanelViewportBounds {
  return { left: 100, top: 80, windowHeight: height + 80, windowWidth: width + 100 };
}

describe('linkPanelViewport', () => {
  it('clamps floating panel positions into the viewport', () => {
    setViewport(1400, 900);
    const size: LinkPanelSize = { height: 630, width: 700 };
    expect(clampLinkPanelPosition({ x: -100, y: 999 }, size, createBounds(1200, 700))).toEqual({ x: 16, y: 134 });
  });

  it('stacks new panels with a small offset while keeping them visible', () => {
    setViewport(1600, 1000);
    const size: LinkPanelSize = { height: 700, width: 800 };
    const bounds = createBounds(1200, 760);
    expect(createInitialLinkPanelPosition(0, size, bounds)).toEqual({ x: 484, y: 96 });
    expect(createInitialLinkPanelPosition(1, size, bounds)).toEqual({ x: 456, y: 124 });
  });

  it('opens beside the click point on the roomier side when an anchor is provided', () => {
    setViewport(1600, 1000);
    const size: LinkPanelSize = { height: 700, width: 800 };
    const bounds = createBounds(1200, 760);

    expect(createAnchoredLinkPanelPosition(0, size, bounds, { x: 320, y: 280 })).toEqual({ x: 484, y: 96 });
    expect(createAnchoredLinkPanelPosition(0, size, bounds, { x: 1240, y: 280 })).toEqual({ x: 16, y: 96 });
  });

  it('shrinks panels to fit inside the available content area', () => {
    expect(fitLinkPanelSizeToBounds({ height: 700, width: 800 }, createBounds(640, 420))).toEqual({
      height: 468,
      width: 708
    });
  });
});
