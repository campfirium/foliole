import { expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { runDevReimportSelectedTopic } from './devReimportSelectedTopic';
import type { RuntimeNodeSourceDetails } from './nodeSourceRuntimePayloads';

function createSourceDetails(): RuntimeNodeSourceDetails {
  return {
    importRuns: [],
    importSource: null,
    inheritedFromParent: false,
    keepImportItem: {
      firstSeenAt: '2026-05-13T00:00:00.000Z',
      hasSourceUpdate: false,
      highlightPath: null,
      keepState: 'enabled',
      lastImportedAt: '2026-05-13T00:00:00.000Z',
      lastSeenAt: '2026-05-13T00:00:00.000Z',
      lastStatus: 'imported',
      localNodeState: 'active',
      primaryPath: null,
      resolvedSourcePath: '/library/topic.md',
      ruleId: 'rule-1',
      ruleLabel: 'Library',
      sourceMtimeMs: 1,
      sourcePath: 'topic.md',
      sourceSizeBytes: 12,
      sourceState: 'present',
      sourceType: 'generic'
    },
    pdfPageDimensions: [],
    sourceNodeId: 'topic-1'
  };
}

it('soft deletes, permanently deletes, and restores the selected keep-import topic', async () => {
  const runtimeInvoke = vi.fn(async () => null);
  const restoreSource = vi.fn(async () => ({
    detail: null,
    node_id: 'topic-new',
    restored_at: '2026-05-13T00:00:02.000Z',
    status: 'restored' as const
  }));

  const result = await runDevReimportSelectedTopic({
    loadSourceDetails: vi.fn(async () => createSourceDetails()),
    nodeId: 'topic-1',
    nodeIdsToDelete: ['topic-1', 'child-1'],
    nodeOrder: ['inbox', 'topic-1', 'topic-2'],
    restoreSource,
    runtimeInvoke
  });

  expect(result).toEqual({ status: 'reimported', nodeId: 'topic-new' });
  expect(runtimeInvoke).toHaveBeenNthCalledWith(1, NATIVE_COMMANDS.softDeleteNodes, {
    deletedAt: expect.any(String),
    nodeIds: ['topic-1', 'child-1']
  });
  expect(runtimeInvoke).toHaveBeenNthCalledWith(2, NATIVE_COMMANDS.deleteNodesPermanently, {
    nodeIds: ['topic-1', 'child-1'],
    nodeOrder: ['inbox', 'topic-2']
  });
  expect(restoreSource).toHaveBeenCalledWith({ ruleId: 'rule-1', sourcePath: 'topic.md' });
});

it('does not delete when the selected topic has no active keep-import source', async () => {
  const runtimeInvoke = vi.fn(async () => null);

  const result = await runDevReimportSelectedTopic({
    loadSourceDetails: vi.fn(async () => ({ ...createSourceDetails(), keepImportItem: null })),
    nodeId: 'topic-1',
    nodeOrder: ['topic-1'],
    restoreSource: vi.fn(),
    runtimeInvoke
  });

  expect(result.status).toBe('unavailable');
  expect(runtimeInvoke).not.toHaveBeenCalled();
});
