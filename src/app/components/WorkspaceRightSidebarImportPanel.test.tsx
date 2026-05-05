import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import { loadRuntimeImportOverview, runRuntimeTextFileImport } from '../../shared/platform/importBridge';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';
import { resetFormalImportState } from '../hooks/useFormalImport';

import { WorkspaceRightSidebarImportPanel } from './WorkspaceRightSidebarImportPanel';

vi.mock('../../shared/platform/importBridge', () => ({
  loadRuntimeImportOverview: vi.fn(),
  runRuntimeTextFileImport: vi.fn()
}));

const EMPTY_IMPORT_OVERVIEW = {
  latestFailure: null,
  latestResult: null,
  recentRuns: []
};

const IMPORTED_RESULT = {
  contentFingerprint: 'content-fingerprint',
  degradedReason: null,
  duplicateSemantic: 'new' as const,
  failureReason: null,
  importId: 'import-1',
  importedAt: '2026-03-22T10:00:00.000Z',
  nodeId: 'node-import-1',
  provider: 'desktop_text_file' as const,
  resultStatus: 'imported' as const,
  sourceFingerprint: 'source-fingerprint',
  sourceKind: 'markdown' as const,
  sourceLocator: '/tmp/imported-note.md',
  sourceName: 'imported-note.md'
};

const IMPORTED_OVERVIEW = {
  latestFailure: {
    contentFingerprint: 'failure-content-fingerprint',
    degradedReason: null,
    duplicateSemantic: 'new' as const,
    failureReason: 'disk failed',
    importId: 'import-2',
    importedAt: '2026-03-22T11:00:00.000Z',
    nodeId: null,
    provider: 'desktop_text_file' as const,
    resultStatus: 'failed' as const,
    sourceFingerprint: 'failure-source-fingerprint',
    sourceKind: 'markdown' as const,
    sourceLocator: '/tmp/failed-note.md',
    sourceName: 'failed-note.md'
  },
  latestResult: IMPORTED_RESULT,
  recentRuns: [IMPORTED_RESULT]
};

function mockDesktopBridge() {
  const invoke = vi.fn(async (...args: unknown[]) => {
    const [command] = args;
    if (command === 'load_reading_progress') {
      return null;
    }
    if (command === 'load_workspace_snapshot') {
      const state = createInitialWorkspaceState(new Date('2026-03-22T08:00:00.000Z'));
      return {
        activeNodeId: 'node-import-1',
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
    return null;
  });
  window.electronAPI = {
    invoke,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
}

function getInboxChildren() {
  return Object.values(useWorkspaceStore.getState().nodesById).filter((node) => node.parentNodeId === INBOX_NODE_ID);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetFormalImportState();
  mockDesktopBridge();
  vi.mocked(loadRuntimeImportOverview).mockResolvedValue(EMPTY_IMPORT_OVERVIEW);
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-03-22T08:00:00.000Z')));
});

it('keeps quick capture and formal import visibly separated', async () => {
  render(<WorkspaceRightSidebarImportPanel />);

  await waitFor(() => {
    expect(loadRuntimeImportOverview).toHaveBeenCalled();
  });

  expect(screen.getByRole('heading', { name: 'Import entry points' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Quick capture' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Formal import' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Quick capture stays in editor' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Import Markdown / HTML / TXT file' })).toBeEnabled();
});

it('shows dedicated import status rows', async () => {
  render(<WorkspaceRightSidebarImportPanel />);

  await waitFor(() => {
    expect(loadRuntimeImportOverview).toHaveBeenCalled();
  });

  expect(screen.getByRole('heading', { name: 'Import status' })).toBeInTheDocument();
  expect(screen.getByText('No imports yet')).toBeInTheDocument();
  expect(screen.getByText('Imported files land as child nodes under Inbox')).toBeInTheDocument();
  expect(screen.getByText('Nothing recorded')).toBeInTheDocument();
  expect(screen.getByText('No import result recorded yet.')).toBeInTheDocument();
  expect(screen.getByText('No failed import recorded.')).toBeInTheDocument();
});

it('imports the selected Markdown file into Inbox', async () => {
  vi.mocked(runRuntimeTextFileImport).mockResolvedValue(IMPORTED_RESULT);
  vi.mocked(loadRuntimeImportOverview)
    .mockResolvedValueOnce(EMPTY_IMPORT_OVERVIEW)
    .mockResolvedValueOnce(IMPORTED_OVERVIEW);

  const initialInboxChildren = getInboxChildren();

  render(<WorkspaceRightSidebarImportPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Import Markdown / HTML / TXT file' }));

  await waitFor(() => {
    const inboxChildren = getInboxChildren();
    expect(inboxChildren).toHaveLength(initialInboxChildren.length + 1);
    expect(inboxChildren.some((node) => node.content === '# Imported note\nBody')).toBe(true);
  });

  expect(screen.getAllByText(/Imported imported-note\.md/).length).toBeGreaterThan(0);
  expect(screen.getByText('Inbox child created from imported-note.md')).toBeInTheDocument();
  expect(screen.getByText('markdown · /tmp/imported-note.md')).toBeInTheDocument();
  expect(screen.getByText('Failed failed-note.md')).toBeInTheDocument();
  expect(screen.getByText('disk failed')).toBeInTheDocument();
});
