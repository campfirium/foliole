import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { onWorkspaceSyncApplied } from '../../shared/platform/runtimeShellEvents';
import { requestWorkspaceStateRefresh, requestWorkspaceSyncRefresh } from '../../store/workspaceRefreshScheduler';

import { useWorkspaceSyncAppliedRefresh } from './useWorkspaceSyncAppliedRefresh';

vi.mock('../../shared/platform/runtimeShellEvents', () => ({ onWorkspaceSyncApplied: vi.fn().mockResolvedValue(vi.fn()) }));
vi.mock('../../shared/platform/desktop/systemEntryDisplayNamesRuntimeRepository', () => ({
  hydrateRuntimeSystemEntryDisplayNames: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('../../store/workspaceRefreshScheduler', () => ({ requestWorkspaceStateRefresh: vi.fn(), requestWorkspaceSyncRefresh: vi.fn() }));

it('refreshes a committed node scope without requesting a complete workspace hydrate', () => {
  const view = renderHook(useWorkspaceSyncAppliedRefresh);
  const callback = vi.mocked(onWorkspaceSyncApplied).mock.calls[0]?.[0];
  callback?.({ appliedNodeIds: ['article'], appliedObjectIds: ['article'], appliedReviewOpIds: [],
    workspaceScope: { kind: 'nodes', nodeIds: ['article'] }, libraryScope: 'library' });
  expect(requestWorkspaceStateRefresh).not.toHaveBeenCalled();
  expect(requestWorkspaceSyncRefresh).toHaveBeenCalledWith({ kind: 'nodes', nodeIds: ['article'] }, 'library');
  view.unmount();
});
