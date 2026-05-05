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

it('keeps scrollbar thumbs in the assigned surface hue when the surface is chromatic', () => {
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
    palette: ['#dce8f6', '#364a66']
  });

  expect(root.style.getPropertyValue('--workspace-region-main-rail-scrollbar-thumb-color')).toBe('#b7d2f0');
  expect(root.style.getPropertyValue('--workspace-region-main-sidebar-scrollbar-thumb-color')).toBe('#456796');
});

it('borrows row surface hue for neutral document scrollbars', () => {
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
      'main-topic': 1,
      'main-document': 0,
      'main-sidebar': 1,
      'footer-rail': 0,
      'footer-folder': 0,
      'footer-topic': 0,
      'footer-document': 0,
      'footer-sidebar': 0
    },
    palette: ['#ffffff', '#f3ecd8']
  });

  expect(root.style.getPropertyValue('--workspace-region-main-document-scrollbar-thumb-color')).toBe('#f7f0df');
});

it('derives divider direction per workspace surface instead of per base theme', () => {
  const root = document.documentElement;

  applyWorkspaceSurfaceSettings(root, {
    assignments: {
      'titlebar-rail': 0,
      'titlebar-folder': 1,
      'titlebar-topic': 1,
      'titlebar-document': 1,
      'titlebar-sidebar': 1,
      'main-rail': 0,
      'main-folder': 1,
      'main-topic': 1,
      'main-document': 1,
      'main-sidebar': 1,
      'footer-rail': 0,
      'footer-folder': 1,
      'footer-topic': 1,
      'footer-document': 1,
      'footer-sidebar': 1
    },
    palette: ['#8b7b44', '#f3ecd8']
  });

  expect(root.style.getPropertyValue('--workspace-region-main-rail-divider-mix-target')).toBe('white');
  expect(root.style.getPropertyValue('--workspace-region-main-folder-divider-mix-target')).toBe('black');
  expect(root.style.getPropertyValue('--workspace-region-footer-rail-divider-mix-target')).toBe('white');
});

it('keeps medium warm surfaces in the light divider direction', () => {
  const root = document.documentElement;

  applyWorkspaceSurfaceSettings(root, {
    assignments: {
      'titlebar-rail': 0,
      'titlebar-folder': 1,
      'titlebar-topic': 1,
      'titlebar-document': 1,
      'titlebar-sidebar': 1,
      'main-rail': 0,
      'main-folder': 1,
      'main-topic': 1,
      'main-document': 1,
      'main-sidebar': 1,
      'footer-rail': 0,
      'footer-folder': 1,
      'footer-topic': 1,
      'footer-document': 1,
      'footer-sidebar': 1
    },
    palette: ['#b8aa79', '#f3ecd8']
  });

  expect(root.style.getPropertyValue('--workspace-region-main-rail-divider-mix-target')).toBe('black');
  expect(root.style.getPropertyValue('--workspace-region-titlebar-rail-divider-mix-target')).toBe('black');
});

it('keeps light sidebar panels tinted instead of washing them to white', () => {
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
    palette: ['#f0f0f0', '#e3e6f0']
  });

  expect(root.style.getPropertyValue('--workspace-region-main-sidebar-panel-bg')).toBe('#e1e4ef');
  expect(root.style.getPropertyValue('--workspace-region-main-sidebar-panel-elevated-bg')).toBe('#e8eaf3');
});
