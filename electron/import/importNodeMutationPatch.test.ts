// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-node-mutation-patch-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import type { NativeTextImportResult } from '../../lib/platform/nativeContract.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { runPreparedImport } from '../database/importPipeline.js';
import { initializeDatabase } from '../database/migrate.js';

import { buildImportNodeMutationPatch } from './importNodeMutationPatch.js';

beforeEach(async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-patch-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(() => {
  closeDatabaseConnection();
});

function toNativeResult(
  imported: ReturnType<typeof runPreparedImport>,
  overrides: Partial<NativeTextImportResult> = {}
): NativeTextImportResult {
  return {
    content_fingerprint: imported.contentFingerprint,
    degraded_reason: imported.degradedReason,
    duplicate_semantic: imported.duplicateSemantic,
    failure_reason: imported.failureReason,
    import_id: imported.importId,
    imported_at: imported.importedAt,
    node_id: imported.nodeId,
    provider: imported.provider,
    result_status: imported.resultStatus,
    source_fingerprint: imported.sourceFingerprint,
    source_kind: imported.sourceKind,
    source_locator: imported.sourceLocator,
    source_name: imported.sourceName,
    ...overrides
  };
}

it('builds a node mutation patch from imported sqlite nodes without loading a full workspace snapshot', () => {
  const imported = runPreparedImport({
    content: 'Imported body',
    contentFingerprint: 'content-fp',
    degradedReason: null,
    importedAt: '2026-06-09T10:00:00.000Z',
    nodeTitle: 'Imported note',
    provider: 'desktop_text_file',
    sourceFingerprint: 'source-fp',
    sourceKind: 'markdown',
    sourceLocator: '/tmp/imported.md',
    sourceName: 'imported.md',
    sourceTrackingMode: 'untracked',
    hideTitleHeading: false
  });

  const patch = buildImportNodeMutationPatch([toNativeResult(imported)]);

  expect(patch).toMatchObject({
    createdNodeIds: [imported.nodeId],
    nodeOrder: expect.arrayContaining([imported.nodeId]),
    nodes: [
      expect.objectContaining({
        content: 'Imported body',
        nodeId: imported.nodeId,
        title: 'Imported note'
      })
    ]
  });
});

it('does not reduce a persisted EPUB hierarchy to a root-only mutation patch', () => {
  const imported = runPreparedImport({
    content: 'Book cover',
    contentFingerprint: 'epub-content-fp',
    degradedReason: null,
    importedAt: '2026-06-09T10:00:00.000Z',
    nodeTitle: 'Imported book',
    provider: 'desktop_text_file',
    sourceFingerprint: 'epub-source-fp',
    sourceKind: 'epub',
    sourceLocator: '/tmp/imported.epub',
    sourceName: 'imported.epub',
    sourceTrackingMode: 'untracked',
    hideTitleHeading: false
  });

  expect(buildImportNodeMutationPatch([toNativeResult(imported)])).toBeNull();
});

it('rejects a partial batch patch when a Markdown result shares the batch with an EPUB', () => {
  const markdown = runPreparedImport({
    content: 'Markdown body',
    contentFingerprint: 'markdown-content-fp',
    degradedReason: null,
    importedAt: '2026-06-09T10:00:00.000Z',
    nodeTitle: 'Imported note',
    provider: 'desktop_text_file',
    sourceFingerprint: 'markdown-source-fp',
    sourceKind: 'markdown',
    sourceLocator: '/tmp/imported.md',
    sourceName: 'imported.md',
    sourceTrackingMode: 'untracked',
    hideTitleHeading: false
  });
  const epub = runPreparedImport({
    content: 'Book cover',
    contentFingerprint: 'mixed-epub-content-fp',
    degradedReason: null,
    importedAt: '2026-06-09T10:00:01.000Z',
    nodeTitle: 'Imported book',
    provider: 'desktop_text_file',
    sourceFingerprint: 'mixed-epub-source-fp',
    sourceKind: 'epub',
    sourceLocator: '/tmp/mixed.epub',
    sourceName: 'mixed.epub',
    sourceTrackingMode: 'untracked',
    hideTitleHeading: false
  });

  expect(buildImportNodeMutationPatch([toNativeResult(markdown), toNativeResult(epub)])).toBeNull();
});
