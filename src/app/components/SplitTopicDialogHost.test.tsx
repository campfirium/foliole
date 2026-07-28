import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { saveSplitTopicWorkspaceMutation } from '../../shared/platform/workspaceRuntimeRepository';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { SplitTopicDialogHost } from './SplitTopicDialogHost';
import { requestSplitTopicDialog } from './SplitTopicDialogRequest';

vi.mock('../../shared/platform/workspaceRuntimeRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/platform/workspaceRuntimeRepository')>()),
  saveSplitTopicWorkspaceMutation: vi.fn()
}));

vi.mock('../../shared/ui/AppRuntimeNotice', () => ({
  showAppRuntimeNotice: vi.fn()
}));

function seedWorkspace() {
  const initial = createInitialWorkspaceState(new Date('2026-07-28T00:00:00.000Z'));
  useWorkspaceStore.setState({
    ...initial,
    activeNodeId: 'source-topic',
    nodeOrder: ['folder-1', 'source-topic', 'topic-after'],
    nodesById: {
      ...initial.nodesById,
      'folder-1': {
        id: 'folder-1',
        parentNodeId: null,
        kind: 'folder',
        title: 'Folder',
        content: '',
        reveal: null,
        review: null,
        createdAt: '2026-07-28T00:00:00.000Z',
        updatedAt: '2026-07-28T00:00:00.000Z'
      },
      'source-topic': {
        id: 'source-topic',
        parentNodeId: 'folder-1',
        kind: 'topic',
        title: 'Source',
        hasContent: true,
        content: 'Alpha\n---\n# Beta\nBody',
        reveal: null,
        review: null,
        createdAt: '2026-07-28T00:00:00.000Z',
        updatedAt: '2026-07-28T00:00:00.000Z'
      },
      'topic-after': {
        id: 'topic-after',
        parentNodeId: 'folder-1',
        kind: 'topic',
        title: 'After',
        content: 'After',
        reveal: null,
        review: null,
        createdAt: '2026-07-28T00:00:00.000Z',
        updatedAt: '2026-07-28T00:00:00.000Z'
      }
    }
  });
}

afterEach(() => {
  vi.mocked(saveSplitTopicWorkspaceMutation).mockReset();
});

it('previews split Topics and leaves storage untouched when canceled', () => {
  seedWorkspace();
  renderWithLocalization(<SplitTopicDialogHost />);

  act(() => requestSplitTopicDialog('source-topic'));
  fireEvent.change(screen.getByLabelText('Delimiter'), { target: { value: '---' } });

  expect(screen.getByRole('heading', { name: 'Split Topic' })).toBeInTheDocument();
  expect(screen.getAllByText('Alpha').length).toBeGreaterThan(0);
  expect(screen.getByText('Beta')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(saveSplitTopicWorkspaceMutation).not.toHaveBeenCalled();
  expect(useWorkspaceStore.getState().trashedNodeIds).not.toContain('source-topic');
});

it('confirms through the Split Topic native mutation and applies the returned patch', async () => {
  seedWorkspace();
  vi.mocked(saveSplitTopicWorkspaceMutation).mockImplementation(async (args) => ({
    activeNodeId: args.activeNodeId,
    createdNodeIds: args.generatedNodes.map((node) => node.id),
    deletedNodeIds: [args.sourceNodeId],
    nodeOrder: args.nodeOrder,
    nodes: args.generatedNodes.map((node, position) => ({
      anchorLink: null,
      content: position === 1 ? '' : node.content,
      createdAt: node.createdAt,
      hideTitleHeading: false,
      isTitleManual: false,
      kind: node.kind,
      nodeId: node.id,
      parentNodeId: node.parentNodeId,
      position,
      reveal: null,
      review: null,
      title: node.title,
      updatedAt: node.updatedAt
    }))
  }));
  renderWithLocalization(<SplitTopicDialogHost />);

  act(() => requestSplitTopicDialog('source-topic'));
  fireEvent.change(screen.getByLabelText('Delimiter'), { target: { value: '---' } });
  fireEvent.click(screen.getByRole('button', { name: 'Split Topic' }));

  await waitFor(() => expect(saveSplitTopicWorkspaceMutation).toHaveBeenCalledTimes(1));
  const payload = vi.mocked(saveSplitTopicWorkspaceMutation).mock.calls[0]![0];
  expect(payload.sourceNodeId).toBe('source-topic');
  expect(payload.generatedNodes.map((node) => node.content)).toEqual(['Alpha\n', '\n# Beta\nBody']);
  const sourceIndex = payload.nodeOrder.indexOf('source-topic');
  expect(payload.nodeOrder.slice(sourceIndex, sourceIndex + 3)).toEqual([
    'source-topic',
    payload.generatedNodes[0]!.id,
    payload.generatedNodes[1]!.id
  ]);

  const state = useWorkspaceStore.getState();
  expect(state.activeNodeId).toBe(payload.generatedNodes[0]!.id);
  expect(state.trashedNodeIds).toContain('source-topic');
  expect(state.nodesById[payload.generatedNodes[1]!.id]?.title).toBe('Beta');
  expect(state.nodesById[payload.generatedNodes[1]!.id]?.content).toBe('\n# Beta\nBody');
  expect(state.rendererBoundaryKeepNodeIds).toEqual(payload.generatedNodes.map((node) => node.id));
});
