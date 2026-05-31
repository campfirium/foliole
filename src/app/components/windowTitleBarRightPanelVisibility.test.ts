import { describe, expect, it } from 'vitest';

import { resolveRightPanelAvailableWidthFromSidebarWidth, resolveVisibleRightPanelCount } from './windowTitleBarRightPanelVisibility';

describe('resolveVisibleRightPanelCount', () => {
  it('shows the first panel button as soon as the compact row can fit it beside the more menu', () => {
    expect(resolveVisibleRightPanelCount({ availableWidth: 69, maxCount: 3 })).toBe(0);
    expect(resolveVisibleRightPanelCount({ availableWidth: 70, maxCount: 3 })).toBe(1);
  });

  it('caps the visible panel buttons after the titlebar maximum', () => {
    expect(resolveVisibleRightPanelCount({ availableWidth: 102, maxCount: 3 })).toBe(2);
    expect(resolveVisibleRightPanelCount({ availableWidth: 134, maxCount: 3 })).toBe(3);
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
