import { expect, it } from 'vitest';

import type { WorkspaceListAreaProps } from './WorkspaceLayoutGridSections';
import { areWorkspaceListAreaPropsEqual } from './workspaceListAreaMemo';

it('rerenders the workspace list when manual virtual collections change', () => {
  const base = {
    manualVirtualCollections: [{ availableMaterialNodeIds: [], description: '', id: 'folder-1', itemCount: 0, title: 'Before', updatedAt: '1' }]
  } as unknown as WorkspaceListAreaProps;
  const next = {
    ...base,
    manualVirtualCollections: [{ availableMaterialNodeIds: [], description: '', id: 'folder-1', itemCount: 0, title: 'After', updatedAt: '2' }]
  } as WorkspaceListAreaProps;

  expect(areWorkspaceListAreaPropsEqual(base, next)).toBe(false);
  expect(areWorkspaceListAreaPropsEqual(next, next)).toBe(true);
});
