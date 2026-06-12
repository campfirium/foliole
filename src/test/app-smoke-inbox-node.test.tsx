import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import type { ElectronAPI } from '../shared/platform/electronApi';
import { useWorkspaceStore } from '../store/workspaceStore';

import {
  createImportedNodeRuntimeInvoke,
  createImportedWorkspaceSnapshot,
  createSuccessfulImportResult
} from './app-smoke-inbox-node.support';

async function getNodeListPanel() {
  return (await screen.findAllByRole('complementary', { name: 'Topic list panel' }))[0]!;
}

it('shows Inbox in the node tree and opens the folder list surface', async () => {
  window.electronAPI = {
    invoke: createImportedNodeRuntimeInvoke(),
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
  useWorkspaceStore.setState({
    ...createImportedWorkspaceSnapshot(),
    isHydrated: true
  });

  render(<App />);

  const inboxItem = within(await getNodeListPanel()).getByRole('treeitem', { name: 'Inbox' });
  expect(inboxItem).toBeInTheDocument();

  fireEvent.click(inboxItem);

  expect(screen.getByRole('heading', { level: 2, name: 'Inbox' })).toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Folder contents' })).toBeInTheDocument();
  expect(await screen.findByTestId('folder-list-title-node-imported')).toHaveTextContent('Imported note');
  expect(screen.queryByLabelText('Prompt editor')).not.toBeInTheDocument();
});

it('keeps virtual folders out of the main tree and shows a separate lower Virtual section', async () => {
  render(<App />);

  fireEvent.click(within(await getNodeListPanel()).getByRole('treeitem', { name: 'Virtual' }));

  expect(within(await getNodeListPanel()).getByRole('treeitem', { name: 'Virtual' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Virtual search' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create Folder' })).not.toBeInTheDocument();
});

it('shows import and clipboard import actions in the left toolbar without Watch Manager', () => {
  render(<App />);

  expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Import Clipboard' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Watch Manager' })).not.toBeInTheDocument();
});

it('routes import from the left toolbar through the runtime bridge', async () => {
  const invoke = vi.fn(async (...args: [string, Record<string, unknown>?]) => {
    const [command] = args;
    if (command === 'select_import_text_file') {
      return {
        content: '# Note',
        file_name: 'note.md',
        file_path: '/tmp/note.md',
        kind: 'markdown'
      };
    }
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
    if (command === 'load_node_backlinks') {
      return [];
    }
    if (command === 'load_readwise_books_inventory') {
      return { books: [] };
    }
    return null;
  });
  window.electronAPI = {
    invoke: invoke as ElectronAPI['invoke'],
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Import' }));

  await waitFor(() => {
    expect(invoke.mock.calls.some(([command, payload]) => command === 'run_text_file_import' && payload?.file_path === '/tmp/note.md')).toBe(true);
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
    expect(screen.getByRole('button', { name: 'Open Imported note' })).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Open Imported PDF' })).toBeInTheDocument();
  });
});

it('keeps clipboard import marked as in progress in the left toolbar', () => {
  render(<App />);

  expect(screen.getByRole('button', { name: 'Import Clipboard' })).toBeInTheDocument();
});
