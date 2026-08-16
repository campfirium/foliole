import { vi } from 'vitest';

import type { ElectronAPI } from '../shared/platform/electronApi';

export function createImportedWorkspaceSnapshot(title = 'Imported note') {
  return {
    activeNodeId: 'special-inbox',
    nodeOrder: ['special-inbox', 'node-imported'],
    nodesById: {
      'special-inbox': {
        id: 'special-inbox',
        parentNodeId: null,
        kind: 'folder' as const,
        specialKind: 'inbox' as const,
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
        kind: 'topic' as const,
        title,
        isTitleManual: true,
        hideTitleHeading: false,
        content: `# ${title}`,
        hasContent: true,
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

export function createSuccessfulImportResult(overrides?: Partial<Record<string, unknown>>) {
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

export function createSuccessfulImportOverview(result = createSuccessfulImportResult()) {
  return {
    latest_failure: null,
    latest_result: result,
    recent_runs: []
  };
}

export function createImportedNodeRuntimeInvoke(options?: {
  importedNodeTitle?: string;
  importResult?: ReturnType<typeof createSuccessfulImportResult>;
}): ElectronAPI['invoke'] {
  const importResult = options?.importResult ?? createSuccessfulImportResult();
  const workspaceSnapshot = createImportedWorkspaceSnapshot(options?.importedNodeTitle);
  return vi.fn(async (...args: [string, Record<string, unknown>?]) => {
    const [command, payload] = args;
    if (command === 'load_workspace_list_snapshot') return workspaceSnapshot;
    if (command === 'load_reading_progress') return { activeNodeId: 'special-inbox', nodeViewStateById: {} };
    if (command === 'load_node_backlinks') return [];
    if (command === 'load_readwise_books_inventory') return { books: [] };
    if (command === 'select_import_text_file') {
      return {
        content: '',
        file_name: importResult.source_name,
        file_path: importResult.source_locator,
        kind: importResult.source_kind
      };
    }
    if (command === 'load_node_document' && payload?.nodeId === 'special-inbox') {
      return { nodeId: 'special-inbox', kind: 'folder', content: '', hideTitleHeading: false, reveal: null };
    }
    if (command === 'load_node_document' && payload?.nodeId === 'node-imported') {
      return {
        nodeId: 'node-imported',
        kind: 'topic',
        content: `# ${options?.importedNodeTitle ?? 'Imported note'}`,
        hideTitleHeading: false,
        reveal: null
      };
    }
    if (command === 'run_text_file_import') return importResult;
    if (command === 'load_import_overview') return createSuccessfulImportOverview(importResult);
    return null;
  });
}
