import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { loadSplitTopicPreferences, saveSplitTopicPreferences } from '../../shared/platform/desktop/splitTopicPreferences';
import { saveSplitTopicWorkspaceMutation } from '../../shared/platform/workspaceRuntimeRepository';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { SplitTopicDialogHost } from './SplitTopicDialogHost';
import { requestSplitTopicDialog } from './SplitTopicDialogRequest';

vi.mock('../../shared/platform/workspaceRuntimeRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/platform/workspaceRuntimeRepository')>()),
  saveSplitTopicWorkspaceMutation: vi.fn()
}));

vi.mock('../../shared/platform/desktop/splitTopicPreferences', () => ({
  loadSplitTopicPreferences: vi.fn(),
  saveSplitTopicPreferences: vi.fn()
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
  vi.mocked(loadSplitTopicPreferences).mockReset();
  vi.mocked(saveSplitTopicPreferences).mockReset();
});

it('previews split Topics and leaves storage untouched when canceled', async () => {
  seedWorkspace();
  vi.mocked(loadSplitTopicPreferences).mockResolvedValue({ delimiter: '---', disposition: 'replace', keepDelimiter: false });
  renderWithLocalization(<SplitTopicDialogHost />);

  act(() => requestSplitTopicDialog('source-topic'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled());

  expect(screen.getByRole('heading', { name: 'Split Topic' })).toBeInTheDocument();
  const preview = within(screen.getByRole('region', { name: 'Preview' }));
  expect(preview.getAllByText('Alpha')).toHaveLength(1);
  expect(preview.getAllByText('Beta')).toHaveLength(1);
  expect(preview.getByText('Body')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('switch', { name: /^Keep delimiter/ }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Delimiter' }), { target: { value: '#' } });
  await waitFor(() => expect(preview.getByText('#')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(saveSplitTopicWorkspaceMutation).not.toHaveBeenCalled();
  expect(saveSplitTopicPreferences).not.toHaveBeenCalled();
  expect(useWorkspaceStore.getState().trashedNodeIds).not.toContain('source-topic');
});

it('confirms through the Split Topic native mutation and applies the returned patch', async () => {
  seedWorkspace();
  vi.mocked(loadSplitTopicPreferences).mockResolvedValue({ delimiter: '---', disposition: 'replace', keepDelimiter: false });
  vi.mocked(saveSplitTopicPreferences).mockResolvedValue({ delimiter: '---', disposition: 'replace', keepDelimiter: false });
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
  await waitFor(() => expect(screen.getByRole('button', { name: 'Split Topic' })).toBeEnabled());
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
  expect(saveSplitTopicPreferences).toHaveBeenCalledWith({ delimiter: '---', disposition: 'replace', keepDelimiter: false });
});

it('restores only device preferences, keeps Before and After blank, and preserves the source in Keep mode', async () => {
  seedWorkspace();
  vi.mocked(loadSplitTopicPreferences).mockResolvedValue({ delimiter: '---', disposition: 'keep-as-parent', keepDelimiter: true });
  vi.mocked(saveSplitTopicPreferences).mockResolvedValue({ delimiter: '---', disposition: 'keep-as-parent', keepDelimiter: true });
  vi.mocked(saveSplitTopicWorkspaceMutation).mockImplementation(async (args) => ({
    activeNodeId: args.activeNodeId,
    createdNodeIds: args.generatedNodes.map((node) => node.id),
    deletedNodeIds: [],
    nodeOrder: args.nodeOrder,
    nodes: args.generatedNodes.map((node, position) => ({ anchorLink: null, content: node.content, createdAt: node.createdAt, isTitleManual: false, kind: 'topic', nodeId: node.id, parentNodeId: node.parentNodeId, position, reveal: null, title: node.title, updatedAt: node.updatedAt }))
  }));
  renderWithLocalization(<SplitTopicDialogHost />);
  act(() => requestSplitTopicDialog('source-topic'));

  await waitFor(() => expect(screen.getByRole('radio', { name: 'Keep' })).toBeChecked());
  expect(screen.getByLabelText('Before')).toHaveValue('');
  expect(screen.getByLabelText('After')).toHaveValue('');
  expect(screen.getByRole('switch', { name: /^Keep delimiter/ })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Split Topic' }));

  await waitFor(() => expect(saveSplitTopicWorkspaceMutation).toHaveBeenCalledTimes(1));
  const payload = vi.mocked(saveSplitTopicWorkspaceMutation).mock.calls[0]![0];
  expect(payload.disposition).toBe('keep-as-parent');
  expect('deletedAt' in payload).toBe(false);
  expect(payload.generatedNodes.every((node) => node.parentNodeId === 'source-topic')).toBe(true);
  expect(useWorkspaceStore.getState().trashedNodeIds).not.toContain('source-topic');
});

it('does not save preferences when the Topic mutation fails', async () => {
  seedWorkspace();
  vi.mocked(loadSplitTopicPreferences).mockResolvedValue({ delimiter: '---', disposition: 'replace', keepDelimiter: false });
  vi.mocked(saveSplitTopicWorkspaceMutation).mockResolvedValue(null);
  renderWithLocalization(<SplitTopicDialogHost />);
  act(() => requestSplitTopicDialog('source-topic'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Split Topic' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Split Topic' }));

  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Split Topic failed.'));
  expect(saveSplitTopicPreferences).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'Split Topic' })).toBeVisible();
});

it('closes after a successful mutation when preference saving fails', async () => {
  seedWorkspace();
  vi.mocked(loadSplitTopicPreferences).mockResolvedValue({ delimiter: '---', disposition: 'keep-as-parent', keepDelimiter: false });
  vi.mocked(saveSplitTopicPreferences).mockRejectedValue(new Error('disk full'));
  vi.mocked(saveSplitTopicWorkspaceMutation).mockImplementation(async (args) => ({
    activeNodeId: args.activeNodeId,
    createdNodeIds: args.generatedNodes.map((node) => node.id),
    deletedNodeIds: [],
    nodeOrder: args.nodeOrder,
    nodes: args.generatedNodes.map((node, position) => ({ anchorLink: null, content: node.content, createdAt: node.createdAt, isTitleManual: false, kind: 'topic', nodeId: node.id, parentNodeId: node.parentNodeId, position, reveal: null, title: node.title, updatedAt: node.updatedAt }))
  }));
  renderWithLocalization(<SplitTopicDialogHost />);
  act(() => requestSplitTopicDialog('source-topic'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Split Topic' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Split Topic' }));

  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Split Topic' })).not.toBeInTheDocument());
  expect(saveSplitTopicWorkspaceMutation).toHaveBeenCalledTimes(1);
  expect(saveSplitTopicPreferences).toHaveBeenCalledTimes(1);
  expect(useWorkspaceStore.getState().activeNodeId).not.toBe('source-topic');
});
