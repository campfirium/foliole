import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import type { ElectronAPI } from '../shared/platform/electronApi';

function getNodeListPanel() {
  return screen.getByRole('complementary', { name: 'Node list panel' });
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

it('opens import management from the left toolbar instead of replacing Inbox', () => {
  render(<App />);

  const inboxItem = within(getNodeListPanel()).getByRole('treeitem', { name: 'Inbox' });
  fireEvent.click(inboxItem);

  fireEvent.click(screen.getByRole('button', { name: 'Import Management' }));

  expect(screen.getByRole('heading', { name: 'Import management' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Readwise Reader for Obsidian' })).toBeInTheDocument();
  expect(screen.getByLabelText('Trigger draft-import-source-1')).toBeInTheDocument();

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

it('keeps clipboard import marked as in progress in the left toolbar', () => {
  render(<App />);

  expect(screen.getByRole('button', { name: 'Clipboard Import *' })).toBeInTheDocument();
});
