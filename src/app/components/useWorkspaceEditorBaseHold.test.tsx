import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useWorkspaceEditorBaseHold } from './useWorkspaceEditorBaseHold';

const native = vi.hoisted(() => ({
  retain: vi.fn(), release: vi.fn(), drain: vi.fn()
}));
vi.mock('../../shared/platform/workspaceRuntimeRepository', () => ({
  hasWorkspaceRuntimeRepository: () => true
}));
vi.mock('../../shared/platform/workspaceRuntimeDocumentRepository', () => ({
  retainWorkspaceEditorBase: native.retain,
  releaseWorkspaceEditorBase: native.release
}));
vi.mock('../../store/workspaceStoreContentRuntimePersist', () => ({
  drainPendingNodeContentRuntimePersist: native.drain
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('makes the editor writable only after its base is durably held', async () => {
  let finish!: () => void;
  native.retain.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  native.drain.mockResolvedValue(true);
  native.release.mockResolvedValue(undefined);
  const flushDraft = vi.fn(() => true);
  const view = renderHook(({ versionId }) => useWorkspaceEditorBaseHold({
    flushDraft, nodeId: 'node', versionId
  }), { initialProps: { versionId: 'base' } });
  expect(view.result.current).toBe(false);
  expect(native.retain).toHaveBeenCalledWith('node', 'base', expect.stringMatching(/^desktop:/));
  await act(async () => { finish(); });
  expect(view.result.current).toBe(true);
  view.unmount();
  await act(async () => undefined);
  expect(flushDraft).toHaveBeenCalledTimes(1);
  expect(native.drain).toHaveBeenCalledWith('node');
  expect(native.release).toHaveBeenCalledWith('node', expect.stringMatching(/^desktop:/));
});

it('retains the old base when a draft cannot be persisted', async () => {
  native.retain.mockResolvedValue(undefined);
  native.drain.mockResolvedValue(false);
  const view = renderHook(() => useWorkspaceEditorBaseHold({
    flushDraft: () => true, nodeId: 'node', versionId: 'base'
  }));
  await act(async () => undefined);
  expect(view.result.current).toBe(true);
  view.unmount();
  await act(async () => undefined);
  expect(native.release).not.toHaveBeenCalled();
});
