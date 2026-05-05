import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import type { RuntimeTextImportResult } from '../../shared/platform/importBridge';
import type { RuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceBridge';

import { WorkspaceRightSidebarSourcePanel } from './WorkspaceRightSidebarSourcePanel';

const { loadRuntimeNodeSourceDetails } = vi.hoisted(() => ({
  loadRuntimeNodeSourceDetails: vi.fn()
}));

vi.mock('../../shared/platform/nodeSourceBridge', () => ({
  loadRuntimeNodeSourceDetails
}));

const BASE_NODE: Node = {
  kind: 'topic',
  content: 'Node body',
  createdAt: '2026-03-24T08:00:00.000Z',
  id: 'node-1',
  parentNodeId: null,
  priority: null,
  desiredRetention: null,
  reveal: null,
  review: null,
  title: 'Imported note',
  updatedAt: '2026-03-25T09:00:00.000Z'
};

function createImportResult(overrides: Partial<RuntimeTextImportResult> = {}): RuntimeTextImportResult {
  return {
    contentFingerprint: 'content-1',
    degradedReason: null,
    duplicateSemantic: 'new',
    failureReason: null,
    importId: 'import-1',
    importedAt: '2026-03-25T10:30:00.000Z',
    nodeId: 'node-1',
    provider: 'desktop_text_file',
    resultStatus: 'imported',
    sourceFingerprint: 'source-1',
    sourceKind: 'markdown',
    sourceLocator: '/tmp/inbox/imported-note.md',
    sourceName: 'imported-note.md',
    ...overrides
  };
}

function createNodeSourceDetails(overrides: Partial<RuntimeNodeSourceDetails> = {}): RuntimeNodeSourceDetails {
  return {
    importRuns: [createImportResult()],
    importSource: {
      firstImportedAt: '2026-03-25T10:30:00.000Z',
      lastContentFingerprint: 'content-1',
      lastImportedAt: '2026-03-25T10:30:00.000Z',
      latestNodeId: 'node-1',
      provider: 'desktop_text_file',
      sourceFingerprint: 'source-1',
      sourceKind: 'markdown',
      sourceLocator: '/tmp/inbox/imported-note.md',
      sourceName: 'imported-note.md'
    },
    inheritedFromParent: false,
    keepImportItem: null,
    sourceNodeId: 'node-1',
    ...overrides
  };
}

const NODE_SOURCE_DETAILS = createNodeSourceDetails({
  importRuns: [
    createImportResult({
      degradedReason: 'HTML conversion degraded: table',
      duplicateSemantic: 'updated',
      importId: 'import-2',
      importedAt: '2026-03-25T12:30:00.000Z',
      resultStatus: 'degraded',
      sourceKind: 'html',
      sourceLocator: '/tmp/inbox/imported-note.html',
      sourceName: 'imported-note.html'
    }),
    createImportResult()
  ],
  importSource: {
    firstImportedAt: '2026-03-24T12:00:00.000Z',
    lastContentFingerprint: 'content-2',
    lastImportedAt: '2026-03-25T12:30:00.000Z',
    latestNodeId: 'node-1',
    provider: 'desktop_text_file',
    sourceFingerprint: 'source-2',
    sourceKind: 'html',
    sourceLocator: '/tmp/inbox/imported-note.html',
    sourceName: 'imported-note.html'
  },
  keepImportItem: {
    firstSeenAt: '2026-03-24T12:00:00.000Z',
    hasSourceUpdate: true,
    highlightPath: '/Users/me/Readwise/Articles',
    keepState: 'enabled',
    lastImportedAt: '2026-03-25T12:30:00.000Z',
    lastSeenAt: '2026-03-25T12:40:00.000Z',
    lastStatus: 'imported',
    primaryPath: '/Users/me/Readwise/Full Document Contents/Articles',
    ruleId: 'draft-import-source-1',
    ruleLabel: 'Readwise articles',
    resolvedSourcePath: '/Users/me/Readwise/Full Document Contents/Articles/imported-note.md',
    sourceMtimeMs: 123,
    sourcePath: '/Users/me/Readwise/Full Document Contents/Articles/imported-note.md',
    sourceSizeBytes: 456,
    sourceType: 'readwise'
  }
});

function renderSourcePanel() {
  render(<WorkspaceRightSidebarSourcePanel activeNodeId="node-1" nodesById={{ 'node-1': BASE_NODE }} />);
}

async function expectLoadedNodeSourcePanel() {
  await waitFor(() => {
    expect(loadRuntimeNodeSourceDetails).toHaveBeenCalledWith('node-1');
  });
  expect(screen.getByRole('heading', { level: 3, name: 'Import summary' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 3, name: 'Stored source' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 3, name: 'Tracked source' })).toBeInTheDocument();
  expect(screen.getAllByText('imported-note.html')).toHaveLength(2);
  expect(screen.getAllByText('HTML conversion degraded: table')).toHaveLength(2);
  expect(screen.getAllByText('Imported with issues')).toHaveLength(2);
  expect(screen.getByText('/Users/me/Readwise/Full Document Contents/Articles/imported-note.md')).toBeInTheDocument();
  expect(screen.getByText('Readwise articles')).toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Node import history' })).toBeInTheDocument();
  expect(screen.getByText('Imported as new node')).toBeInTheDocument();
}

describe('WorkspaceRightSidebarSourcePanel', () => {
  beforeEach(() => {
    loadRuntimeNodeSourceDetails.mockReset();
  });

  it('renders stored source and tracked source details for the selected node', async () => {
    loadRuntimeNodeSourceDetails.mockResolvedValue(NODE_SOURCE_DETAILS);
    renderSourcePanel();
    await expectLoadedNodeSourcePanel();
  });

  it('shows an empty state when the selected node has no import records', async () => {
    loadRuntimeNodeSourceDetails.mockResolvedValue(createNodeSourceDetails({ importRuns: [], importSource: null, keepImportItem: null }));
    renderSourcePanel();

    await waitFor(() => {
      expect(screen.getByText('This node has no recorded import source yet.')).toBeInTheDocument();
    });
  });
});
