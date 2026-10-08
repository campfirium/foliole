import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { savePartitionedWorkspaceBody } from '../../shared/platform/desktop/workspaceBodyPartition';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { requestBodyOverflow } from '../../shared/ui/bodyOverflowRequest';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';
import { drainPendingNodeContentRuntimePersists } from '../../store/workspaceStoreContentRuntimePersist';

import { BodyOverflowDialogHost } from './BodyOverflowDialogHost';

vi.mock('../../shared/ui/AppRuntimeNotice', () => ({ showAppRuntimeNotice: vi.fn() }));
vi.mock('../../shared/platform/desktop/workspaceBodyPartition', () => ({ savePartitionedWorkspaceBody: vi.fn() }));
vi.mock('../../store/workspaceStoreContentRuntimePersist', () => ({ drainPendingNodeContentRuntimePersists: vi.fn() }));

beforeEach(() => {
  vi.mocked(savePartitionedWorkspaceBody).mockReset();
  vi.mocked(drainPendingNodeContentRuntimePersists).mockReset().mockResolvedValue(true);
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-10-08T00:00:00.000Z')));
});

function openRequest() {
  const request = { nodeId: 'source', previousContent: 'original', content: 'whole prospective body',
    prepare: vi.fn(() => true), cancel: vi.fn() };
  renderWithLocalization(<BodyOverflowDialogHost />);
  act(() => requestBodyOverflow(request));
  return request;
}

it('cancels without applying or saving the candidate', () => {
  const request = openRequest();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(request.prepare).not.toHaveBeenCalled();
  expect(request.cancel).toHaveBeenCalledOnce();
  expect(savePartitionedWorkspaceBody).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('saves the full candidate after flushing the original draft and selects a stored part', async () => {
  const request = openRequest();
  const now = '2026-10-08T00:00:00.000Z';
  vi.mocked(savePartitionedWorkspaceBody).mockResolvedValue({ activeNodeId: 'part', createdNodeIds: ['part'], nodeOrder: ['source', 'part'], nodes: [
    { nodeId: 'source', parentNodeId: null, kind: 'topic', isTitleManual: true, title: 'Source', content: '', reveal: null, anchorLink: null, position: 0, createdAt: now, updatedAt: now },
    { nodeId: 'part', parentNodeId: 'source', kind: 'topic', isTitleManual: true, title: 'Part', content: request.content, reveal: null, anchorLink: null, position: 1, createdAt: now, updatedAt: now }
  ] });
  fireEvent.click(screen.getByRole('button', { name: 'Split and save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(savePartitionedWorkspaceBody).toHaveBeenCalledWith({ sourceNodeId: 'source', expectedContent: 'original', content: request.content });
  expect(drainPendingNodeContentRuntimePersists).toHaveBeenCalledOnce();
  expect(useWorkspaceStore.getState().activeNodeId).toBe('part');
  expect(useWorkspaceStore.getState().nodesById.source?.content).toBe('');
  expect(useWorkspaceStore.getState().nodesById.part?.content).toBe(request.content);
});

it('keeps the candidate available for retry or cancellation when persistence fails', async () => {
  openRequest();
  vi.mocked(savePartitionedWorkspaceBody).mockRejectedValue(new Error('fixture_failure'));
  fireEvent.click(screen.getByRole('button', { name: 'Split and save' }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Split and save' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
});

it.each(['item', 'annotation'])('rejects %s overflow without showing the body split dialog', (kind) => {
  const seed = useWorkspaceStore.getState().nodesById['node-1']!;
  useWorkspaceStore.setState({ nodesById: { source: { ...seed, id: 'source', kind: kind === 'item' ? 'item' : 'topic',
    anchorLink: kind === 'annotation' ? { id: 'link', kind: 'highlight', locator: { from: 0, to: 3, originalText: 'abc' } } : null } } });
  const before = useWorkspaceStore.getState().nodesById;
  const request = openRequest();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(request.cancel).toHaveBeenCalledOnce();
  expect(savePartitionedWorkspaceBody).not.toHaveBeenCalled();
  expect(useWorkspaceStore.getState().nodesById).toBe(before);
  expect(showAppRuntimeNotice).toHaveBeenCalled();
});
