import { waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ assets: vi.fn() }));
vi.mock('../../features/guidedSample/model/guidedSampleAssetImports', () => ({ importGuidedSampleTopicAssets: mocks.assets }));
vi.mock('../../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));

import { findGuidedSampleRootNodeId } from '../../features/guidedSample/model/guidedSampleWorkspace';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { openGuidedSampleCommand } from './openGuidedSampleCommand';

beforeEach(() => {
  localStorage.clear();
  mocks.assets.mockReset();
  mocks.assets.mockResolvedValue(undefined);
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-10-15T00:00:00Z')));
});

const actions = () => ({ closeTrashView: vi.fn(), openNotesView: vi.fn(),
  startReviewSession: vi.fn(() => true), startStudyMode: vi.fn() });

it('keeps a newly created topic selected when startup sample assets finish later', async () => {
  let finishAssets!: () => void;
  mocks.assets.mockReturnValue(new Promise<void>(resolve => { finishAssets = resolve; }));
  const controls = actions();
  const opening = openGuidedSampleCommand(controls, 'startup');
  await waitFor(() => expect(mocks.assets).toHaveBeenCalled());
  const created = await useWorkspaceStore.getState().createRootNode('User draft');
  finishAssets();
  await opening;
  expect(useWorkspaceStore.getState().activeNodeId).toBe(created);
  expect(useWorkspaceStore.getState().nodesById[created!]?.content).toBe('User draft');
  expect(controls.startStudyMode).not.toHaveBeenCalled();
});

it('opens the startup sample when the user has not taken over', async () => {
  const controls = actions();
  await openGuidedSampleCommand(controls, 'startup');
  expect(useWorkspaceStore.getState().activeNodeId).toBe(findGuidedSampleRootNodeId(useWorkspaceStore.getState()));
  expect(controls.startStudyMode).toHaveBeenCalledWith({ force: true });
});
it('honors an explicit sample command even when another topic is created while assets load', async () => {
  let finishAssets!: () => void;
  mocks.assets.mockReturnValue(new Promise<void>(resolve => { finishAssets = resolve; }));
  const controls = actions();
  const opening = openGuidedSampleCommand(controls);
  await waitFor(() => expect(mocks.assets).toHaveBeenCalled());
  await useWorkspaceStore.getState().createRootNode('User draft');
  finishAssets();
  await opening;
  expect(useWorkspaceStore.getState().activeNodeId).toBe(findGuidedSampleRootNodeId(useWorkspaceStore.getState()));
  expect(controls.startStudyMode).toHaveBeenCalledWith({ force: true });
});
