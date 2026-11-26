import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { loadSplitTopicPreferences, saveSplitTopicPreferences } from '../../shared/platform/desktop/splitTopicPreferences';
import { loadSplitTopicWorkspacePreview, saveSplitTopicWorkspaceMutation } from '../../shared/platform/workspaceRuntimeRepository';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';
import { recordSplitTopicTrace } from '../splitTopicTrace';

import { SplitTopicDialogHost } from './SplitTopicDialogHost';
import { requestSplitTopicDialog } from './SplitTopicDialogRequest';

vi.mock('../../shared/platform/workspaceRuntimeRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/platform/workspaceRuntimeRepository')>()),
  loadSplitTopicWorkspacePreview: vi.fn(),
  saveSplitTopicWorkspaceMutation: vi.fn()
}));

vi.mock('../../shared/platform/desktop/splitTopicPreferences', () => ({
  loadSplitTopicPreferences: vi.fn(),
  saveSplitTopicPreferences: vi.fn()
}));

vi.mock('../splitTopicTrace', { spy: true });

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

const sourcePreview = { content: 'Alpha\n---\n# Beta\nBody', parentNodeId: 'folder-1', revision: 'a'.repeat(64) };

beforeEach(() => {
  vi.mocked(loadSplitTopicWorkspacePreview).mockResolvedValue(sourcePreview);
});

afterEach(() => {
  vi.mocked(loadSplitTopicWorkspacePreview).mockReset();
  vi.mocked(saveSplitTopicWorkspaceMutation).mockReset();
  vi.mocked(loadSplitTopicPreferences).mockReset();
  vi.mocked(saveSplitTopicPreferences).mockReset();
});

it('previews split Topics and leaves storage untouched when canceled', async () => {
  seedWorkspace();
  vi.mocked(loadSplitTopicPreferences).mockResolvedValue({ delimiter: '---', disposition: 'replace', keepDelimiter: false });
  renderWithLocalization(<SplitTopicDialogHost />);

  const trace = { startedAt: 1, attempt: 1 };
  act(() => requestSplitTopicDialog('source-topic', trace));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled());
  // The trace effects run after the commit that enables Cancel.
  await waitFor(() => expect(vi.mocked(recordSplitTopicTrace).mock.calls
    .filter(([recording]) => recording === trace).map(([, detail]) => detail)).toEqual([
    { event: 'split.topic.stage', stage: 'dialog-opened' },
    { event: 'split.topic.preview', delimiter: 'matched', parts: 2 }
  ]));

  expect(screen.getByRole('heading', { name: 'Split Topic' })).toBeInTheDocument();
  const preview = within(screen.getByRole('region', { name: 'Preview' }));
  expect(preview.getAllByText('Alpha').length).toBeGreaterThan(0);
  expect(preview.getAllByText('Beta').length).toBeGreaterThan(0);
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
  expect(payload).toMatchObject({ sourceNodeId: 'source-topic', expectedSourceRevision: sourcePreview.revision });
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

it('keeps the dialog open and shows the refreshed Topic after a stale confirmation', async () => {
  seedWorkspace();
  vi.mocked(loadSplitTopicPreferences).mockResolvedValue({ delimiter: '---', disposition: 'replace', keepDelimiter: false });
  const preview = { content: 'Revised Alpha\n---\n# Beta\nRefreshed body', parentNodeId: 'folder-1', revision: 'b'.repeat(64) };
  vi.mocked(saveSplitTopicWorkspaceMutation).mockResolvedValue({
    status: 'source-changed', preview
  });
  renderWithLocalization(<SplitTopicDialogHost />);

  act(() => requestSplitTopicDialog('source-topic'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Split Topic' })).toBeEnabled());
  fireEvent.click(screen.getByRole('switch', { name: /^Keep delimiter/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Split Topic' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/changed.*preview/i);
  const region = within(screen.getByRole('region', { name: 'Preview' }));
  expect(region.getByText('Refreshed body')).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: /^Keep delimiter/ })).toBeChecked();
  expect(saveSplitTopicPreferences).not.toHaveBeenCalled();
  expect(useWorkspaceStore.getState().trashedNodeIds).not.toContain('source-topic');

  fireEvent.click(screen.getByRole('button', { name: 'Split Topic' }));
  await waitFor(() => expect(saveSplitTopicWorkspaceMutation).toHaveBeenCalledTimes(2));
  const retry = vi.mocked(saveSplitTopicWorkspaceMutation).mock.calls[1]![0];
  expect(retry).toMatchObject({ expectedSourceRevision: preview.revision });
  expect(retry.generatedNodes[1]?.content).toContain('Refreshed body');
});
