import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { resetFormalImportState } from '../app/hooks/useFormalImport';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import type { ElectronAPI } from '../shared/platform/electronApi';
import { createInitialWorkspaceState } from '../store/workspaceStore';

const IMPORT_OVERVIEW_PAYLOAD = {
  latest_failure: {
    content_fingerprint: 'failure-content-fingerprint',
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: 'disk failed',
    import_id: 'import-2',
    imported_at: '2026-03-22T11:00:00.000Z',
    node_id: null,
    provider: 'desktop_text_file',
    result_status: 'failed',
    source_fingerprint: 'failure-source-fingerprint',
    source_kind: 'markdown',
    source_locator: '/tmp/failed-note.md',
    source_name: 'failed-note.md'
  },
  latest_result: {
    content_fingerprint: 'content-fingerprint',
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: null,
    import_id: 'import-1',
    imported_at: '2026-03-22T10:00:00.000Z',
    node_id: 'node-import-1',
    provider: 'desktop_text_file',
    result_status: 'imported',
    source_fingerprint: 'source-fingerprint',
    source_kind: 'markdown',
    source_locator: '/tmp/imported-note.md',
    source_name: 'imported-note.md'
  },
  recent_runs: [
    {
      content_fingerprint: 'content-fingerprint',
      degraded_reason: null,
      duplicate_semantic: 'new',
      failure_reason: null,
      import_id: 'import-1',
      imported_at: '2026-03-22T10:00:00.000Z',
      node_id: 'node-import-1',
      provider: 'desktop_text_file',
      result_status: 'imported',
      source_fingerprint: 'source-fingerprint',
      source_kind: 'markdown',
      source_locator: '/tmp/imported-note.md',
      source_name: 'imported-note.md'
    }
  ]
};

function getNodeListPanel() {
  return screen.getByRole('complementary', { name: 'Node list panel' });
}

function createWorkspaceSnapshot() {
  const state = createInitialWorkspaceState(new Date('2026-03-22T08:00:00.000Z'));
  return {
    activeNodeId: INBOX_NODE_ID,
    nodeOrder: [...state.nodeOrder, 'node-import-1'],
    nodesById: {
      ...state.nodesById,
      'node-import-1': {
        anchorLink: null,
        content: '# Imported note\nBody',
        createdAt: '2026-03-22T10:00:00.000Z',
        id: 'node-import-1',
        isTitleManual: true,
        parentNodeId: INBOX_NODE_ID,
        reading: null,
        reveal: null,
        review: null,
        title: 'imported-note.md',
        updatedAt: '2026-03-22T10:00:00.000Z'
      }
    },
    trashedNodeIds: []
  };
}

function createDesktopInvoke(): ElectronAPI['invoke'] {
  const workspaceSnapshot = createWorkspaceSnapshot();
  return (async (command: string) => {
    if (command === 'load_reading_progress') {
      return null;
    }
    if (command === 'load_workspace_snapshot') {
      return workspaceSnapshot;
    }
    if (command === 'load_import_overview') {
      return IMPORT_OVERVIEW_PAYLOAD;
    }
    return null;
  }) as ElectronAPI['invoke'];
}

it('shows Inbox in the node tree and opens its empty state landing', () => {
  render(<App />);

  const inboxItem = within(getNodeListPanel()).getByRole('treeitem', { name: 'Inbox' });
  expect(inboxItem).toBeInTheDocument();

  fireEvent.click(inboxItem);

  expect(screen.getByText('Inbox is ready')).toBeInTheDocument();
  expect(
    screen.getByText(
      'Formal imports land under Inbox first. Review source metadata and recent outcomes here before opening a child node.'
    )
  ).toBeInTheDocument();
  expect(screen.queryByLabelText('Prompt editor')).not.toBeInTheDocument();
});

it('shows imported Inbox nodes, source metadata, latest result, and failure entry', async () => {
  resetFormalImportState();
  window.electronAPI = {
    invoke: createDesktopInvoke(),
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };

  render(<App />);

  const inboxItem = within(getNodeListPanel()).getByRole('treeitem', { name: 'Inbox' });
  fireEvent.click(inboxItem);

  await waitFor(() => {
    expect(screen.getByText('Imported nodes')).toBeInTheDocument();
  });

  expect(screen.getAllByText('imported-note.md').length).toBeGreaterThan(0);
  expect(screen.getByText('markdown · /tmp/imported-note.md')).toBeInTheDocument();
  expect(screen.getByText('Latest result')).toBeInTheDocument();
  expect(screen.getByText('Failure entry')).toBeInTheDocument();
  expect(screen.getByText('Failed failed-note.md')).toBeInTheDocument();
  expect(screen.getByText('disk failed')).toBeInTheDocument();
  expect(screen.queryByLabelText('Prompt editor')).not.toBeInTheDocument();
});
