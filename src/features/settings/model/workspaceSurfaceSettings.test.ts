import { expect, it } from 'vitest';

import { applyWorkspaceSurfaceSettings } from './workspaceSurfaceSettings';

it('toggles folder-topic divider opacity per workspace row when the two colors diverge', () => {
  const root = document.documentElement;

  applyWorkspaceSurfaceSettings(root, {
    assignments: {
      'titlebar-rail': 0,
      'titlebar-folder': 1,
      'titlebar-topic': 2,
      'titlebar-document': 3,
      'titlebar-sidebar': 4,
      'main-rail': 0,
      'main-folder': 1,
      'main-topic': 2,
      'main-document': 3,
      'main-sidebar': 4,
      'footer-rail': 0,
      'footer-folder': 1,
      'footer-topic': 1,
      'footer-document': 3,
      'footer-sidebar': 4
    },
    palette: ['#101010', '#202020', '#303030', '#404040', '#505050']
  });

  expect(root.style.getPropertyValue('--workspace-divider-titlebar-folder-topic-opacity')).toBe('1');
  expect(root.style.getPropertyValue('--workspace-divider-main-folder-topic-opacity')).toBe('1');
  expect(root.style.getPropertyValue('--workspace-divider-footer-folder-topic-opacity')).toBe('0');
});

it('derives sidebar panel and scrollbar colors from the assigned workspace surface', () => {
  const root = document.documentElement;

  applyWorkspaceSurfaceSettings(root, {
    assignments: {
      'titlebar-rail': 0,
      'titlebar-folder': 0,
      'titlebar-topic': 0,
      'titlebar-document': 0,
      'titlebar-sidebar': 0,
      'main-rail': 0,
      'main-folder': 0,
      'main-topic': 0,
      'main-document': 0,
      'main-sidebar': 1,
      'footer-rail': 0,
      'footer-folder': 0,
      'footer-topic': 0,
      'footer-document': 0,
      'footer-sidebar': 0
    },
    palette: ['#f0f0f0', '#505050']
  });

  expect(root.style.getPropertyValue('--workspace-region-main-rail-scrollbar-thumb-color')).toBe('#dbdbdb');
  expect(root.style.getPropertyValue('--workspace-region-main-sidebar-scrollbar-thumb-color')).toBe('#6e6e6e');
  expect(root.style.getPropertyValue('--workspace-region-main-sidebar-panel-bg')).toBe('#5e5e5e');
  expect(root.style.getPropertyValue('--workspace-region-main-sidebar-panel-elevated-bg')).toBe('#696969');
});
