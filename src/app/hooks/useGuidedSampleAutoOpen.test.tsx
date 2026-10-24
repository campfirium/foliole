import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ assets: vi.fn(), consume: vi.fn() }));
vi.mock('../../features/guidedSample/model/guidedSampleAssetImports', () => ({ importGuidedSampleTopicAssets: mocks.assets }));
vi.mock('../../shared/platform/desktop/guidedSampleStartupRuntime', () => ({ consumeGuidedSampleStartup: mocks.consume }));
vi.mock('../../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));

import { INBOX_NODE_ID } from '../../../lib/core/database/specialNodeIds';
import { ensureGuidedSampleTopicTree } from '../../features/guidedSample/model/guidedSampleWorkspace';
import { createEmptyWorkspaceActionHistory } from '../../store/workspaceActionHistory';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { useGuidedSampleAutoOpen } from './useGuidedSampleAutoOpen';

beforeEach(() => {
  localStorage.clear();
  mocks.assets.mockReset();
  mocks.assets.mockResolvedValue(undefined);
  mocks.consume.mockReset();
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-10-24T00:00:00Z')));
});

const actions = () => ({ openNotesView: vi.fn(), startStudyMode: vi.fn() });

async function seedSampleLikeANewLibrary() {
  const result = await ensureGuidedSampleTopicTree(() => useWorkspaceStore.getState());
  useWorkspaceStore.setState({ activeNodeId: null, appActionHistory: createEmptyWorkspaceActionHistory() });
  return result.rootNodeId!;
}

it('leaves an empty library empty when the host has no new-library sample to open', async () => {
  mocks.consume.mockResolvedValue(null);
  const nodeOrder = [...useWorkspaceStore.getState().nodeOrder];
  renderHook(() => useGuidedSampleAutoOpen(true, actions()));
  await waitFor(() => expect(mocks.consume).toHaveBeenCalledTimes(1));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(useWorkspaceStore.getState().nodeOrder).toEqual(nodeOrder);
});

it('opens the sample the host seeded into a new library without creating or recording anything', async () => {
  const rootNodeId = await seedSampleLikeANewLibrary();
  const nodeOrder = [...useWorkspaceStore.getState().nodeOrder];
  mocks.consume.mockResolvedValue(rootNodeId);
  const controls = actions();
  renderHook(() => useGuidedSampleAutoOpen(true, controls));
  await waitFor(() => expect(controls.startStudyMode).toHaveBeenCalledWith({ force: true }));
  const state = useWorkspaceStore.getState();
  expect(state.activeNodeId).toBe(rootNodeId);
  expect(state.reviewSession.currentNodeId).toBe(rootNodeId);
  expect(state.nodeOrder).toEqual(nodeOrder);
  expect(state.appActionHistory.undoStack).toHaveLength(0);
});

it('opens the seeded sample even when hydration restored a system folder', async () => {
  const rootNodeId = await seedSampleLikeANewLibrary();
  useWorkspaceStore.setState({ activeNodeId: INBOX_NODE_ID });
  mocks.consume.mockResolvedValue(rootNodeId);
  const controls = actions();
  renderHook(() => useGuidedSampleAutoOpen(true, controls));
  await waitFor(() => expect(controls.startStudyMode).toHaveBeenCalledWith({ force: true }));
  expect(useWorkspaceStore.getState().activeNodeId).toBe(rootNodeId);
});

it('waits for hydration and asks the host only once', async () => {
  mocks.consume.mockResolvedValue(null);
  const controls = actions();
  const view = renderHook(({ hydrated }) => useGuidedSampleAutoOpen(hydrated, controls), {
    initialProps: { hydrated: false }
  });
  expect(mocks.consume).not.toHaveBeenCalled();
  view.rerender({ hydrated: true });
  view.rerender({ hydrated: true });
  await waitFor(() => expect(mocks.consume).toHaveBeenCalledTimes(1));
});
