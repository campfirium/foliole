import { expect, it, vi } from 'vitest';

import { createBreadcrumbSnapshot } from './CompanionShellBreadcrumbTestSupport';
import { selectCompanionBreadcrumbNode } from './CompanionShellContent';

function createProps(isBrowseDirectoryOpen: boolean) {
  return {
    isBrowseDirectoryOpen,
    onChangeDirectorySelection: vi.fn(),
    surface: { handleSelectBrowseNode: vi.fn() },
    workspaceSync: { state: { workspace_snapshot: createBreadcrumbSnapshot() } }
  };
}

it('moves the directory to a container ancestor chosen from an article breadcrumb', () => {
  const props = createProps(true);
  selectCompanionBreadcrumbNode(props as never, 'folder-1');
  expect(props.surface.handleSelectBrowseNode).toHaveBeenCalledWith('folder-1');
  expect(props.onChangeDirectorySelection).toHaveBeenCalledWith({ kind: 'internal', nodeId: 'folder-1' });
});

it('leaves directory selection alone outside the directory', () => {
  const props = createProps(false);
  selectCompanionBreadcrumbNode(props as never, 'folder-1');
  expect(props.surface.handleSelectBrowseNode).toHaveBeenCalledWith('folder-1');
  expect(props.onChangeDirectorySelection).not.toHaveBeenCalled();
});
