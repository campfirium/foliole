import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { InboxImportLanding } from './InboxImportLanding';

const { useFormalImportMock } = vi.hoisted(() => ({
  useFormalImportMock: vi.fn()
}));

const RECENT_RUNS = [
  {
    contentFingerprint: 'content-1',
    degradedReason: null,
    duplicateSemantic: 'new',
    failureReason: null,
    importId: 'run-1',
    importedAt: '2026-04-10T08:30:00.000Z',
    nodeId: 'node-1',
    provider: 'desktop_text_file',
    resultStatus: 'imported',
    sourceFingerprint: 'source-1',
    sourceKind: 'markdown',
    sourceLocator: '/imports/essay.md',
    sourceName: 'essay.md'
  },
  {
    contentFingerprint: 'content-2',
    degradedReason: null,
    duplicateSemantic: 'duplicate',
    failureReason: null,
    importId: 'run-2',
    importedAt: '2026-04-10T08:10:00.000Z',
    nodeId: 'node-1',
    provider: 'desktop_text_file',
    resultStatus: 'imported',
    sourceFingerprint: 'source-2',
    sourceKind: 'markdown',
    sourceLocator: '/imports/essay-copy.md',
    sourceName: 'essay-copy.md'
  },
  {
    contentFingerprint: 'content-3',
    degradedReason: null,
    duplicateSemantic: 'new',
    failureReason: 'Could not parse metadata',
    importId: 'run-3',
    importedAt: '2026-04-10T08:00:00.000Z',
    nodeId: null,
    provider: 'desktop_text_file',
    resultStatus: 'failed',
    sourceFingerprint: 'source-3',
    sourceKind: 'pdf',
    sourceLocator: '/imports/failure.pdf',
    sourceName: 'failure.pdf'
  }
] as const;

const LINKED_NODES = {
  'node-1': {
    content: '# Essay node\n\nUseful body text',
    createdAt: '2026-04-09T00:00:00.000Z',
    id: 'node-1',
    kind: 'item',
    parentNodeId: 'folder-1',
    reveal: null,
    review: null,
    title: 'Essay node',
    updatedAt: '2026-04-10T08:30:00.000Z'
  }
} satisfies Record<string, Node>;

vi.mock('../hooks/useFormalImport', () => ({
  useFormalImport: useFormalImportMock
}));

beforeEach(() => {
  useFormalImportMock.mockReturnValue({
    isAvailable: true,
    isImporting: false,
    overview: {
      latestFailure: null,
      latestResult: null,
      recentRuns: []
    },
    resetImportData: vi.fn(),
    startImportDirectory: vi.fn(),
    startImportFile: vi.fn(),
    status: {
      failures: '',
      inboxLanding: '',
      lastRun: ''
    }
  });
});

it('keeps Inbox history focused on a single continuous imports list', () => {
  render(<InboxImportLanding nodesById={{}} onSelectNode={() => undefined} />);

  expect(screen.getByRole('heading', { level: 2, name: 'Inbox History' })).toBeInTheDocument();
  expect(screen.getByRole('searchbox', { name: 'Search Inbox history' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sort imports by Date imported' })).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Sort imports by Date imported' }), { key: 'ArrowDown' });
  expect(screen.getByRole('menuitem', { name: 'Last opened' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Date imported' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Title' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { level: 3, name: 'Books inventory' })).not.toBeInTheDocument();
  expect(screen.getByText('No imported Inbox topics or recent runs yet.')).toBeInTheDocument();
});

it('shows recent inbox items and lets the user open linked topics from both lists', () => {
  const onSelectNode = vi.fn();
  useFormalImportMock.mockReturnValue({
    isAvailable: true,
    isImporting: false,
    overview: {
      latestFailure: null,
      latestResult: null,
      recentRuns: RECENT_RUNS
    },
    resetImportData: vi.fn(),
    startImportDirectory: vi.fn(),
    startImportFile: vi.fn(),
    status: {
      failures: '',
      inboxLanding: '',
      lastRun: ''
    }
  });

  render(<InboxImportLanding nodesById={LINKED_NODES} onSelectNode={onSelectNode} />);

  expect(screen.getByText(/linked topics/)).toHaveTextContent('1 linked topics · 3 recent runs');
  expect(screen.getByText('4')).toBeInTheDocument();
  expect(screen.getAllByText('Essay node')).toHaveLength(3);
  expect(screen.getAllByText('markdown · /imports/essay.md')).toHaveLength(2);
  expect(screen.getAllByText('Useful body text')).toHaveLength(3);
  expect(screen.getAllByText('Useful body text')[0]).toHaveClass('line-clamp-3');
  expect(screen.getAllByText('markdown · /imports/essay.md')[0]).toHaveClass('truncate');
  expect(screen.getAllByText('markdown · /imports/essay.md')[0]).toHaveAttribute('title', 'markdown · /imports/essay.md');
  expect(screen.getByText('pdf · /imports/failure.pdf')).toBeInTheDocument();
  expect(screen.getByText('Could not parse metadata')).toBeInTheDocument();
  expect(screen.getByText('Failed failure.pdf')).toBeInTheDocument();

  fireEvent.click(screen.getAllByRole('button', { name: 'Open topic' })[0]!);
  fireEvent.click(screen.getAllByRole('button', { name: 'Open topic' })[1]!);

  expect(onSelectNode).toHaveBeenCalledTimes(2);
  expect(onSelectNode).toHaveBeenCalledWith('node-1');
});

it('filters inbox imports through the shared search field', () => {
  useFormalImportMock.mockReturnValue({
    isAvailable: true,
    isImporting: false,
    overview: {
      latestFailure: null,
      latestResult: null,
      recentRuns: RECENT_RUNS
    },
    resetImportData: vi.fn(),
    startImportDirectory: vi.fn(),
    startImportFile: vi.fn(),
    status: {
      failures: '',
      inboxLanding: '',
      lastRun: ''
    }
  });

  render(<InboxImportLanding nodesById={LINKED_NODES} onSelectNode={() => undefined} />);

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search Inbox history' }), { target: { value: 'failure' } });

  expect(screen.getByText(/linked topics/)).toHaveTextContent('0 linked topics · 1 recent runs');
  expect(screen.queryByText('Essay node')).not.toBeInTheDocument();
  expect(screen.getByText('Failed failure.pdf')).toBeInTheDocument();
});
