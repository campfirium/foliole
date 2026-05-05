import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import type { ElectronAPI } from '../shared/platform/electronApi';

function getNodeListPanel() {
  return screen.getByRole('complementary', { name: 'Node list panel' });
}

function createImportedWorkspaceSnapshot() {
  return {
    activeNodeId: 'special-inbox',
    nodeOrder: ['special-inbox', 'node-imported'],
    nodesById: {
      'special-inbox': {
        id: 'special-inbox',
        parentNodeId: null,
        kind: 'folder',
        specialKind: 'inbox',
        title: 'Inbox',
        isTitleManual: true,
        hideTitleHeading: false,
        content: '',
        hasContent: false,
        reveal: null,
        hasReveal: false,
        anchorLink: null,
        reading: null,
        review: null,
        createdAt: '2026-03-22T09:55:00.000Z',
        updatedAt: '2026-03-22T09:55:00.000Z'
      },
      'node-imported': {
        id: 'node-imported',
        parentNodeId: 'special-inbox',
        kind: 'topic',
        title: 'Imported note',
        isTitleManual: true,
        hideTitleHeading: false,
        content: '',
        hasContent: false,
        reveal: null,
        hasReveal: false,
        anchorLink: null,
        reading: null,
        review: null,
        createdAt: '2026-03-22T10:00:00.000Z',
        updatedAt: '2026-03-22T10:00:00.000Z'
      }
    },
    trashedNodeIds: []
  };
}

function createSuccessfulImportResult() {
  return {
    content_fingerprint: 'content-success',
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: null,
    import_id: 'import-2',
    imported_at: '2026-03-22T10:00:00.000Z',
    node_id: 'node-imported',
    provider: 'desktop_text_file',
    result_status: 'imported',
    source_fingerprint: 'source-fingerprint-2',
    source_kind: 'markdown',
    source_locator: '/tmp/imported-note.md',
    source_name: 'imported-note.md'
  };
}

function createSuccessfulImportOverview() {
  return {
    latest_failure: null,
    latest_result: createSuccessfulImportResult(),
    recent_runs: []
  };
}

function createImportedNodeRuntimeInvoke(): ElectronAPI['invoke'] {
  const workspaceSnapshot = createImportedWorkspaceSnapshot();
  return vi.fn(async (...args: [string, Record<string, unknown>?]) => {
    const [command, payload] = args;
    if (command === 'load_workspace_list_snapshot') {
      return workspaceSnapshot;
    }
    if (command === 'load_reading_progress') {
      return {
        activeNodeId: 'special-inbox',
        nodeViewStateById: {}
      };
    }
    if (command === 'load_node_document' && payload?.nodeId === 'special-inbox') {
      return {
        nodeId: 'special-inbox',
        kind: 'folder',
        content: '',
        hideTitleHeading: false,
        reveal: null
      };
    }
    if (command === 'run_text_file_import') {
      return createSuccessfulImportResult();
    }
    if (command === 'load_import_overview') {
      return createSuccessfulImportOverview();
    }
    return null;
  });
}

it('shows Inbox in the node tree and opens its empty state landing', () => {
  render(<App />);

  const inboxItem = within(getNodeListPanel()).getByRole('treeitem', { name: 'Inbox' });
  expect(inboxItem).toBeInTheDocument();

  fireEvent.click(inboxItem);

  expect(screen.getByText('Inbox is ready')).toBeInTheDocument();
  expect(
    screen.getByText(
      'Formal imports will land under Inbox. When items arrive, select a child node to read or edit it.'
    )
  ).toBeInTheDocument();
  expect(screen.queryByLabelText('Prompt editor')).not.toBeInTheDocument();
});

it('keeps virtual nodes out of the main tree and opens the virtual list from the titlebar switch', () => {
  render(<App />);

  expect(within(getNodeListPanel()).queryByRole('treeitem', { name: 'Virtual Nodes' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Virtual Nodes' }));

  expect(screen.getByText('No virtual nodes')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create Virtual Node' })).toBeInTheDocument();
});

it('opens import management from the left toolbar instead of replacing Inbox', () => {
  render(<App />);

  const inboxItem = within(getNodeListPanel()).getByRole('treeitem', { name: 'Inbox' });
  fireEvent.click(inboxItem);

  fireEvent.click(screen.getByRole('button', { name: 'Import Management' }));

  expect(screen.getByRole('heading', { name: 'Import management' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Readwise Reader for Obsidian settings' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open Readwise Reader settings' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Close import management' }));

  expect(screen.getByText('Inbox is ready')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Import management' })).not.toBeInTheDocument();
});

it('shows import, clipboard import, and import management actions in the left toolbar', () => {
  render(<App />);

  expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Clipboard Import *' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Import Management' })).toBeInTheDocument();
});

it('routes import from the left toolbar through the runtime bridge', async () => {
  const invoke: ElectronAPI['invoke'] = vi.fn(async (...args: [string, Record<string, unknown>?]) => {
    const [command] = args;
    if (command === 'run_text_file_import') {
      return {
        content_fingerprint: 'content-success',
        degraded_reason: null,
        duplicate_semantic: 'new',
        failure_reason: null,
        import_id: 'import-1',
        imported_at: '2026-03-22T10:00:00.000Z',
        node_id: 'node-1',
        provider: 'desktop_text_file',
        result_status: 'imported',
        source_fingerprint: 'source-fingerprint-1',
        source_kind: 'markdown',
        source_locator: '/tmp/note.md',
        source_name: 'note.md'
      };
    }
    if (command === 'load_import_overview') {
      return {
        latest_failure: null,
        latest_result: null,
        recent_runs: []
      };
    }
    return null;
  });
  window.electronAPI = {
    invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Import' }));

  await waitFor(() => {
    expect(invoke).toHaveBeenCalledWith('run_text_file_import', {});
  });
});

it('shows a newly imported inbox child immediately after import without restarting', async () => {
  const invoke = createImportedNodeRuntimeInvoke();

  window.electronAPI = {
    invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Import' }));

  await waitFor(() => {
    expect(within(getNodeListPanel()).getByRole('treeitem', { name: 'Imported note' })).toBeInTheDocument();
  });
});

it('keeps clipboard import marked as in progress in the left toolbar', () => {
  render(<App />);

  expect(screen.getByRole('button', { name: 'Clipboard Import *' })).toBeInTheDocument();
});
