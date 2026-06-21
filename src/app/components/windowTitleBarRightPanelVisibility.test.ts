import { describe, expect, it } from 'vitest';

import {
  resolveRightPanelAvailableWidth,
  resolveRightPanelAvailableWidthFromSidebarWidth,
  resolveRightSidebarWidthForPanelRow,
  resolveVisibleRightPanelCount
} from './windowTitleBarRightPanelVisibility';

describe('resolveVisibleRightPanelCount', () => {
  it('shows the first panel button as soon as the compact row can fit it beside the more menu', () => {
    expect(resolveVisibleRightPanelCount({ availableWidth: 69, panelCount: 5 })).toBe(0);
    expect(resolveVisibleRightPanelCount({ availableWidth: 70, panelCount: 5 })).toBe(1);
  });

  it('keeps the more menu only while the panel row still overflows', () => {
    expect(resolveVisibleRightPanelCount({ availableWidth: 134, panelCount: 5 })).toBe(3);
    expect(resolveVisibleRightPanelCount({ availableWidth: 165, panelCount: 5 })).toBe(3);
    expect(resolveVisibleRightPanelCount({ availableWidth: 166, panelCount: 5 })).toBe(5);
  });
});

describe('resolveRightPanelAvailableWidthFromSidebarWidth', () => {
  it('subtracts the divider, toggle button, window controls, and control gap', () => {
    expect(resolveRightPanelAvailableWidthFromSidebarWidth(240)).toBe(61);
    expect(resolveRightPanelAvailableWidthFromSidebarWidth(250)).toBe(71);
  });

  it('never returns a negative budget', () => {
    expect(resolveRightPanelAvailableWidthFromSidebarWidth(120)).toBe(0);
  });
});

describe('resolveRightPanelAvailableWidth', () => {
  it('uses the full right sidebar row budget when window controls are absent', () => {
    expect(resolveRightPanelAvailableWidth({ controlsWidth: 0, rightSidebarWidth: 240 })).toBe(207);
  });
});

describe('resolveRightSidebarWidthForPanelRow', () => {
  it('returns the right titlebar width needed to show every common panel without the more menu', () => {
    expect(resolveRightSidebarWidthForPanelRow(5)).toBe(345);
  });
});
