// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../../../electron/ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../../../electron/database/connection.js';
import { runPreparedImport } from '../../../electron/database/importPipeline.js';
import { initializeDatabase } from '../../../electron/database/migrate.js';
import { buildImportNodeMutationPatch } from '../../../electron/import/importNodeMutationPatch.js';
import type { NativeTextImportResult } from '../../../lib/platform/nativeContract.js';
import { toRuntimeTextImportResult } from '../../shared/platform/importRuntimePayloads';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { runImportFlow, shouldRehydrateWorkspace } from './formalImportFlowRunner';
import { useFormalImportState } from './formalImportState';
import { applyImportWorkspacePatch, resetAppliedImportWorkspacePatches } from './formalImportWorkspacePatch';

let tempRoot = '';
beforeEach(async () => {
  resetAppliedImportWorkspacePatches();
  useFormalImportState.setState({ isImporting: false });
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-completion-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  await initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
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

it.each(['notification-first', 'result-first'])('publishes one completion without replaying its order: %s', async (delivery) => {
  const content = '\ufeffImported 中😀\0 body';
  const imported = runPreparedImport({
    content, contentFingerprint: 'completion-content', degradedReason: null,
    importedAt: '2026-10-29T10:00:00.000Z', nodeTitle: 'Completion note',
    provider: 'desktop_text_file', sourceFingerprint: 'completion-source',
    sourceKind: 'markdown', sourceLocator: '/tmp/completion.md', sourceName: 'completion.md',
    sourceTrackingMode: 'untracked', hideTitleHeading: false
  });
  const native = toNativeResult(imported);
  const patch = buildImportNodeMutationPatch([native]);
  const result = toRuntimeTextImportResult({ ...native, node_mutation_patch: patch })!;
  const overview = vi.fn().mockResolvedValue(undefined);
  useWorkspaceStore.setState({ nodesById: {}, nodeOrder: [], activeNodeId: null });
  let publications = 0;
  const unsubscribe = useWorkspaceStore.subscribe((next, previous) => {
    if (next.nodesById !== previous.nodesById) publications += 1;
  });
  try {
    if (delivery === 'notification-first') applyImportWorkspacePatch(result.importId, result.nodeMutationPatch);
    else await runImportFlow(() => Promise.resolve(result), shouldRehydrateWorkspace, overview);
    const first = useWorkspaceStore.getState();
    expect(first.nodesById[imported.nodeId!]?.content).toBe(content);
    expect(first.nodeOrder).toContain(imported.nodeId);
    expect(publications).toBe(1);
    // A later local selection/order must survive delivery of the same committed import.
    const laterOrder = [...first.nodeOrder].reverse().concat('later-local-member');
    useWorkspaceStore.setState({ nodeOrder: laterOrder, activeNodeId: imported.nodeId });
    const beforeReplay = useWorkspaceStore.getState();
    const beforeReplayPublications = publications;
    if (delivery === 'notification-first') await runImportFlow(() => Promise.resolve(result), shouldRehydrateWorkspace, overview);
    else applyImportWorkspacePatch(result.importId, result.nodeMutationPatch);
    expect(useWorkspaceStore.getState().nodeOrder).toBe(beforeReplay.nodeOrder);
    expect(useWorkspaceStore.getState().nodesById).toBe(beforeReplay.nodesById);
    expect(useWorkspaceStore.getState().activeNodeId).toBe(imported.nodeId);
    expect(publications).toBe(beforeReplayPublications);
    expect(overview).toHaveBeenCalledTimes(1);
    closeDatabaseConnection();
    expect(openDatabaseConnection().driver.queryOne('SELECT id FROM nodes WHERE id = ?', [imported.nodeId!])).toBeTruthy();
    expect(buildImportNodeMutationPatch([native])?.nodes[0]?.content).toBe(content);
  } finally {
    unsubscribe();
  }
});
