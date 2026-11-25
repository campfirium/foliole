import { afterEach, expect, it } from 'vitest';

import { installWorkspaceBrowserCommit, prepareBrowserWorkspacePublish } from './workspaceBrowserCommit';
import type { WorkspaceState } from './workspaceStoreTypes';

afterEach(() => installWorkspaceBrowserCommit(null));

it("invalidates today's Flow when only folder enforcement changes", () => {
  installWorkspaceBrowserCommit({ save: () => undefined });
  const folder = { id: 'folder', kind: 'folder', parentNodeId: null, priority: 3, content: '', reveal: null };
  const current = { nodeOrder: ['folder'], trashedNodeIds: [], nodesById: { folder },
    browserDailyFlow: { state: { invalidated: 0 } } } as unknown as WorkspaceState;

  const next = prepareBrowserWorkspacePublish(current, {
    nodesById: { folder: { ...folder, enforcePriority: true } }
  } as unknown as Partial<WorkspaceState>);

  expect(next.browserDailyFlow?.state?.invalidated).toBe(1);
});
