import { describe, expect, it } from 'vitest';

import { resolveRightPanelAvailableWidthFromSidebarWidth, resolveVisibleRightPanelCount } from './windowTitleBarRightPanelVisibility';

describe('resolveVisibleRightPanelCount', () => {
  it('shows only the more menu until a full panel button and gap can fit', () => {
    expect(resolveVisibleRightPanelCount({ availableWidth: 75, maxCount: 3 })).toBe(0);
    expect(resolveVisibleRightPanelCount({ availableWidth: 76, maxCount: 3 })).toBe(1);
  });

  it('caps the visible panel buttons after the titlebar maximum', () => {
    expect(resolveVisibleRightPanelCount({ availableWidth: 114, maxCount: 3 })).toBe(2);
    expect(resolveVisibleRightPanelCount({ availableWidth: 152, maxCount: 3 })).toBe(3);
  });
});

describe('resolveRightPanelAvailableWidthFromSidebarWidth', () => {
  it('subtracts the divider, toggle button, window controls, and control gap', () => {
    expect(resolveRightPanelAvailableWidthFromSidebarWidth(240)).toBe(61);
    expect(resolveRightPanelAvailableWidthFromSidebarWidth(255)).toBe(76);
  });

  it('never returns a negative budget', () => {
    expect(resolveRightPanelAvailableWidthFromSidebarWidth(120)).toBe(0);
  });
});
