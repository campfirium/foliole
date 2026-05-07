import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import type { ElectronAPI } from '../shared/platform/electronApi';

async function getNodeListPanel() {
  return (await screen.findAllByRole('complementary', { name: 'Topic list panel' }))[0];
}

function createImportedWorkspaceSnapshot(title = 'Imported note') {
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
        title,
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

function createSuccessfulImportResult(overrides?: Partial<Record<string, unknown>>) {
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
    source_name: 'imported-note.md',
    ...overrides
  };
}

function createSuccessfulImportOverview(result = createSuccessfulImportResult()) {
  return {
    latest_failure: null,
    latest_result: result,
    recent_runs: []
  };
}

function createImportedNodeRuntimeInvoke(options?: {
  importedNodeTitle?: string;
  importResult?: ReturnType<typeof createSuccessfulImportResult>;
}): ElectronAPI['invoke'] {
  const importResult = options?.importResult ?? createSuccessfulImportResult();
  const workspaceSnapshot = createImportedWorkspaceSnapshot(options?.importedNodeTitle);
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
      return importResult;
    }
    if (command === 'load_import_overview') {
      return createSuccessfulImportOverview(importResult);
    }
    return null;
  });
}

it('shows Inbox in the node tree and opens the folder list surface', async () => {
  window.electronAPI = {
    invoke: createImportedNodeRuntimeInvoke(),
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };

  render(<App />);

  const inboxItem = within(await getNodeListPanel()).getByRole('treeitem', { name: 'Inbox' });
  expect(inboxItem).toBeInTheDocument();

  fireEvent.click(inboxItem);

  expect(screen.getByRole('heading', { level: 2, name: 'Inbox' })).toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Folder contents' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open Imported note' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Prompt editor')).not.toBeInTheDocument();
});

it('keeps virtual folders out of the main tree and shows a separate lower Virtual section', async () => {
  render(<App />);

  fireEvent.click(within(await getNodeListPanel()).getByRole('treeitem', { name: 'Virtual' }));

  expect(within(await getNodeListPanel()).getByRole('treeitem', { name: 'Virtual' })).toBeInTheDocument();
  expect(screen.getByRole('complementary', { name: 'Current folder contents' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create Virtual Folder' })).not.toBeInTheDocument();
});

it('opens import management from the left toolbar instead of replacing Inbox', async () => {
  window.electronAPI = {
    invoke: createImportedNodeRuntimeInvoke(),
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };

  render(<App />);

  const inboxItem = within(await getNodeListPanel()).getByRole('treeitem', { name: 'Inbox' });
  fireEvent.click(inboxItem);

  fireEvent.click(screen.getByRole('button', { name: 'Import Management' }));

  expect(screen.getByRole('heading', { name: 'Import management' })).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Import management navigation' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Inbox' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Readwise Books' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Readwise Articles' })).toBeInTheDocument();
  expect(screen.queryByText('Readwise Reader settings')).not.toBeInTheDocument();

  expect(screen.queryByRole('button', { name: 'Close import management' })).not.toBeInTheDocument();
});

it('shows import, clipboard import, and import management actions in the left toolbar', () => {
  render(<App />);

  expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Import Clipboard' })).toBeInTheDocument();
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
    expect(screen.getByRole('treeitem', { name: 'Imported note' })).toBeInTheDocument();
  });
});

it('shows the imported PDF node in Inbox after manual import', async () => {
  const invoke = createImportedNodeRuntimeInvoke({
    importedNodeTitle: 'Imported PDF',
    importResult: createSuccessfulImportResult({
      node_id: 'node-imported',
      source_kind: 'pdf',
      source_locator: '/tmp/imported-paper.pdf',
      source_name: 'imported-paper.pdf'
    })
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
    expect(screen.getByRole('treeitem', { name: 'Imported PDF' })).toBeInTheDocument();
  });
});

it('keeps clipboard import marked as in progress in the left toolbar', () => {
  render(<App />);

  expect(screen.getByRole('button', { name: 'Import Clipboard' })).toBeInTheDocument();
});
