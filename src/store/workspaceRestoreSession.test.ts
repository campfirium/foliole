import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../shared/platform/workspaceRuntimeRepository', () => ({
  replayPendingWorkspaceDurableMutations: vi.fn(),
  replayPendingWorkspaceNodeSync: vi.fn()
}));
vi.mock('../shared/platform/runtimeInvoke', () => ({
  freezeWorkspaceRuntimeWrites: vi.fn(),
  unfreezeWorkspaceRuntimeWrites: vi.fn(),
  waitForWorkspaceRuntimeWrites: vi.fn()
}));

import {
  freezeWorkspaceRuntimeWrites,
  unfreezeWorkspaceRuntimeWrites,
  waitForWorkspaceRuntimeWrites
} from '../shared/platform/runtimeInvoke';
import { stagePendingNodeOrder } from '../shared/platform/workspacePendingDurableMutations';
import { stagePendingNodeSync } from '../shared/platform/workspacePendingNodeSync';
import {
  replayPendingWorkspaceDurableMutations,
  replayPendingWorkspaceNodeSync
} from '../shared/platform/workspaceRuntimeRepository';

import {
  beginWorkspaceRestoreSession,
  completeWorkspaceRestoreSession,
  consumeWorkspaceRestoreCompletion,
  prepareWorkspaceRestoreHydrate,
  resetWorkspaceRestoreSessionForTests
} from './workspaceRestoreSession';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.mocked(replayPendingWorkspaceDurableMutations).mockReset().mockResolvedValue();
  vi.mocked(replayPendingWorkspaceNodeSync).mockReset().mockResolvedValue();
  vi.mocked(freezeWorkspaceRuntimeWrites).mockReset().mockReturnValue(true);
  vi.mocked(unfreezeWorkspaceRuntimeWrites).mockReset();
  vi.mocked(waitForWorkspaceRuntimeWrites).mockReset().mockResolvedValue();
  window.__folioleFlushPendingEditorDraftBeforeClose = vi.fn().mockResolvedValue(true);
  window.__folioleFlushReadingProgressBeforeClose = vi.fn().mockResolvedValue(true);
});

afterEach(() => {
  delete window.__folioleFlushPendingEditorDraftBeforeClose;
  delete window.__folioleFlushReadingProgressBeforeClose;
  resetWorkspaceRestoreSessionForTests();
});

it('flushes registered and durable writes before freezing the restore session', async () => {
  await expect(beginWorkspaceRestoreSession()).resolves.toBe(true);

  expect(window.__folioleFlushPendingEditorDraftBeforeClose).toHaveBeenCalledOnce();
  expect(window.__folioleFlushReadingProgressBeforeClose).toHaveBeenCalledOnce();
  expect(replayPendingWorkspaceNodeSync).toHaveBeenCalledOnce();
  expect(replayPendingWorkspaceDurableMutations).toHaveBeenCalledOnce();
  expect(freezeWorkspaceRuntimeWrites).toHaveBeenCalledOnce();
  expect(waitForWorkspaceRuntimeWrites).toHaveBeenCalledOnce();
});

it('cancels the restore before the database is touched when a registered flush fails', async () => {
  window.__folioleFlushPendingEditorDraftBeforeClose = vi.fn().mockResolvedValue(false);

  await expect(beginWorkspaceRestoreSession()).resolves.toBe(false);

  expect(freezeWorkspaceRuntimeWrites).not.toHaveBeenCalled();
  expect(unfreezeWorkspaceRuntimeWrites).toHaveBeenCalledOnce();
});

it('discards pre-restore pending snapshots and hands completion to the new renderer session', () => {
  stagePendingNodeOrder(['old-topic']);
  stagePendingNodeSync({ nodeId: 'old-topic', updatedAt: '2026-09-15T00:00:00.000Z' } as never);
  const reload = vi.fn();

  completeWorkspaceRestoreSession('restore-point.db', reload);

  expect(reload).toHaveBeenCalledOnce();
  expect(prepareWorkspaceRestoreHydrate()).toBe(true);
  expect(consumeWorkspaceRestoreCompletion()).toBe('restore-point.db');
  expect(consumeWorkspaceRestoreCompletion()).toBeNull();
});
