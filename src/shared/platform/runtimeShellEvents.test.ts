import { beforeEach, expect, it, vi } from 'vitest';

import type { ElectronAPI, WorkspaceContentChangedPayload, WorkspaceSyncAppliedPayload } from './electronApi';
import {
  onWorkspaceContentChanged,
  onWorkspaceSyncApplied
} from './runtimeShellEvents';

function createMockElectronApi(
  overrides: Partial<ElectronAPI>
): ElectronAPI {
  return {
    invoke: vi.fn(),
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined,
    ...overrides
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  delete window.electronAPI;
});

it('filters empty workspace sync applied events before reaching the handler', async () => {
  const onWorkspaceSyncAppliedBridge = vi.fn((handler: (payload: WorkspaceSyncAppliedPayload) => void) => {
    handler({ appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] });
    handler({ appliedNodeIds: ['node-1'], appliedObjectIds: [], appliedReviewOpIds: [] });
    return () => undefined;
  });
  window.electronAPI = createMockElectronApi({
    onWorkspaceSyncApplied: onWorkspaceSyncAppliedBridge
  });
  const handler = vi.fn();

  await onWorkspaceSyncApplied(handler);

  expect(handler).toHaveBeenCalledTimes(1);
  expect(handler).toHaveBeenCalledWith({ appliedNodeIds: ['node-1'], appliedObjectIds: [], appliedReviewOpIds: [] });
});

it('filters malformed workspace content changed events before reaching the handler', async () => {
  const onWorkspaceContentChangedBridge = vi.fn((handler: (payload: WorkspaceContentChangedPayload) => void) => {
    handler({ scope: '' as WorkspaceContentChangedPayload['scope'] });
    handler({ scope: 'workspace' });
    return () => undefined;
  });
  window.electronAPI = createMockElectronApi({
    onWorkspaceContentChanged: onWorkspaceContentChangedBridge
  });
  const handler = vi.fn();

  await onWorkspaceContentChanged(handler);

  expect(handler).toHaveBeenCalledTimes(1);
  expect(handler).toHaveBeenCalledWith({ scope: 'workspace' });
});
