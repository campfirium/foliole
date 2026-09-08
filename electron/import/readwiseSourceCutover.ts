import fs from 'node:fs/promises';

import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { normalizeReadwiseHostSettings, READWISE_HOST_SETTINGS_KEY } from '../../lib/core/import/readwiseHostSettings.js';
import { prepareReadwiseApiDocuments } from '../../lib/core/readwise/readwiseApiImport.js';
import { READWISE_SOURCE_CUTOVER_KEY, READWISE_SOURCE_CUTOVER_VERSION } from '../../lib/core/readwise/readwiseSourceCutover.js';
import type {
  NativeReadwiseSourceCutoverPreview,
  NativeReadwiseSourceCutoverResult
} from '../../lib/platform/nativeReadwiseSourceCutoverContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { createManagedSafetySnapshotWithBackup } from '../database/managedSafetySnapshots.js';
import { loadStagedReadwiseApiContracts } from '../database/readwiseApiImportState.js';
import { loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import { confirmReadwiseIdentityBindings, loadReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';
import { loadReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';
import { writeJsonSetting } from '../database/settingsStore.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { isStoredReadwiseApiConnectionReady, loadStoredReadwiseHostSettings } from './readwiseApiConnectionState.js';
import { fetchReadwiseApiImportRound } from './readwiseApiImportFetch.js';
import { materializeReadwiseApiDocument } from './readwiseApiMaterialization.js';
import { prepareReadwiseIdentityBindingsForCutover } from './readwiseIdentityBindingPreview.js';
import { readwiseKeepAdapter } from './readwiseKeepAdapter.js';
import { resolveReadwiseTopicMergeSource } from './readwiseTopicMergeSource.js';

interface SourceCountRow { [column: string]: unknown; count: number }
interface BodyRow extends NodeBodyRow { id: string; title: string }

export async function previewReadwiseSourceCutover(): Promise<NativeReadwiseSourceCutoverPreview> {
  if (loadReadwiseSourceCutover()) return { status: 'already_completed', topic_count: 0 };
  const assignment = loadReadwiseHostAssignment();
  if (!assignment.is_active) return { status: 'not_active_host', topic_count: 0 };
  if (!isStoredReadwiseApiConnectionReady()) return { status: 'connection_required', topic_count: 0 };
  const readable = await enabledSourcesAreReadable();
  if (!readable) return { status: 'source_unavailable', topic_count: 0 };
  return { status: 'ready', topic_count: countCurrentHostTopics(assignment.current_host_name) };
}

export async function runReadwiseSourceCutover(): Promise<NativeReadwiseSourceCutoverResult> {
  const preview = await previewReadwiseSourceCutover();
  if (preview.status !== 'ready') return emptyResult(preview.status);
  const source = loadReadwiseRemoteSource();
  if (!source) return emptyResult('connection_required');
  let snapshot: Awaited<ReturnType<typeof createManagedSafetySnapshotWithBackup>> | null = null;
  try {
    const identity = await prepareReadwiseIdentityBindingsForCutover();
    await fetchReadwiseApiImportRound(source.connectionRef, { allowFolderModeForCutover: true });
    const staged = loadStagedReadwiseApiContracts(source.connectionRef);
    const documents = prepareReadwiseApiDocuments(staged.readerDocuments, staged.exportBooks);
    const documentById = new Map(documents.map((document) => [document.id, document]));
    const replacements = await preparePristineBodyReplacements(identity.bindings, documentById);
    const connection = openDatabaseConnection();
    snapshot = await createManagedSafetySnapshotWithBackup({
      reason: 'pre-migration', sourceDatabase: connection.sqlite, sourcePath: connection.dbPath
    });
    const now = new Date().toISOString();
    connection.driver.transaction((driver) => {
      confirmReadwiseIdentityBindings(source.connectionRef, identity.bindings, now);
      for (const replacement of replacements) applyStrictBodyProjection(driver, replacement, now);
      for (const binding of identity.bindings) {
        const document = documentById.get(binding.remoteDocumentId);
        if (document) materializeReadwiseApiDocument({
          config: loadImportManagerSettings().readwiseReaderConfig,
          connectionRef: source.connectionRef,
          document
        });
      }
      writeJsonSetting(driver, READWISE_HOST_SETTINGS_KEY, normalizeReadwiseHostSettings({
        ...loadStoredReadwiseHostSettings(), readwiseSourceMode: 'api', updatedAt: now
      }), now);
      writeJsonSetting(driver, READWISE_SOURCE_CUTOVER_KEY, {
        completedAt: now,
        migratedCount: identity.bindings.length,
        sourceHost: loadReadwiseHostAssignment().current_host_name,
        unmatchedCount: identity.unmatchedCount + identity.conflictCount,
        version: READWISE_SOURCE_CUTOVER_VERSION
      }, now);
    });
    return {
      migrated_count: identity.bindings.length,
      status: 'completed',
      unmatched_count: identity.unmatchedCount + identity.conflictCount
    };
  } catch (error) {
    console.error('[readwise-cutover] migration failed', error);
    return { migrated_count: 0, status: 'failed', unmatched_count: 0 };
  } finally {
    snapshot?.release();
  }
}

async function enabledSourcesAreReadable() {
  const sources = loadImportManagerSettings().readwiseSources.filter((source) => source.keepState === 'enabled');
  if (sources.length === 0) return true;
  try {
    await Promise.all(sources.flatMap((source) => [source.primaryPath, source.highlightPath]
      .filter(Boolean).map(async (directory) => {
        const stats = await fs.stat(directory);
        if (!stats.isDirectory()) throw new Error('readwise_source_not_directory');
      })));
    return true;
  } catch {
    return false;
  }
}

function countCurrentHostTopics(hostName: string) {
  return openDatabaseConnection().driver.queryOne<SourceCountRow>(
    `SELECT COUNT(DISTINCT i.latest_node_id) count FROM import_sources i
     JOIN desktop_sources d ON d.source_ref = i.source_ref
     JOIN nodes n ON n.id = i.latest_node_id AND n.deleted_at IS NULL
     WHERE d.source_type = 'readwise' AND d.host_name = ?`, [hostName]
  )?.count ?? 0;
}

async function preparePristineBodyReplacements(
  bindings: Awaited<ReturnType<typeof prepareReadwiseIdentityBindingsForCutover>>['bindings'],
  documents: Map<string, ReturnType<typeof prepareReadwiseApiDocuments>[number]>
) {
  const rows = [];
  for (const binding of bindings) {
    const document = documents.get(binding.remoteDocumentId);
    const source = await sourceProjection(binding.sourceFingerprint);
    if (document && source && document.category !== 'epub' && source.currentContent === source.legacyContent) {
      rows.push({ content: document.body, nodeId: source.nodeId, title: source.title });
    }
  }
  return rows;
}

async function sourceProjection(sourceFingerprint: string) {
  const driver = openDatabaseConnection().driver;
  const source = driver.queryOne<{ latest_node_id: string }>(
    'SELECT latest_node_id FROM import_sources WHERE source_fingerprint = ?', [sourceFingerprint]
  );
  if (!source?.latest_node_id) return null;
  const mergeSource = await resolveReadwiseTopicMergeSource(source.latest_node_id);
  if (!mergeSource || mergeSource.readwiseSource.kind === 'books') return null;
  const prepared = await readwiseKeepAdapter.loadPreparedRecord(mergeSource.descriptor, {
    highlightDirectoryPath: mergeSource.readwiseSource.highlightPath,
    highlightPolicy: 'reference_only',
    importedAt: new Date().toISOString(),
    kind: mergeSource.readwiseSource.kind,
    readwiseConfig: loadImportManagerSettings().readwiseReaderConfig
  });
  const row = driver.queryOne<BodyRow>(
    `SELECT n.id, n.title, n.content, n.body_blob_hash, cbd.data body_blob_data FROM nodes n
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash WHERE n.id = ? AND n.deleted_at IS NULL`,
    [source.latest_node_id]
  );
  return row ? {
    currentContent: requireResolvedNodeBody(row, row.id).content,
    legacyContent: prepared.content,
    nodeId: row.id,
    title: row.title
  } : null;
}

function applyStrictBodyProjection(
  driver: ReturnType<typeof openDatabaseConnection>['driver'],
  replacement: { content: string; nodeId: string; title: string },
  now: string
) {
  writeNodeBody({ content: replacement.content, driver, nodeId: replacement.nodeId, title: replacement.title, updatedAt: now });
  const anchors = driver.queryAll<{ anchor_link: string; id: string }>(
    'SELECT id, anchor_link FROM nodes WHERE parent_id = ? AND deleted_at IS NULL AND anchor_link IS NOT NULL',
    [replacement.nodeId]
  );
  for (const anchor of anchors) {
    const next = strictAnchor(anchor.anchor_link, replacement.content);
    driver.execute('UPDATE nodes SET anchor_link = ?, image_regions = NULL, updated_at = ? WHERE id = ?', [next, now, anchor.id]);
  }
}

function strictAnchor(value: string, content: string) {
  try {
    const parsed = JSON.parse(value) as { locator?: unknown };
    const values = parsed.locator && typeof parsed.locator === 'object' && 'ranges' in parsed.locator
      ? (parsed.locator as { ranges: unknown[] }).ranges : [parsed.locator];
    const remapped = values.map((item) => {
      const originalText = item && typeof item === 'object' ? (item as { originalText?: unknown }).originalText : null;
      if (typeof originalText !== 'string' || !originalText) return null;
      const from = content.indexOf(originalText);
      return from >= 0 && content.indexOf(originalText, from + 1) < 0 ? { ...(item as object), from, to: from + originalText.length } : null;
    });
    if (remapped.some((item) => !item)) return null;
    parsed.locator = remapped.length === 1 ? remapped[0] : { ranges: remapped };
    return JSON.stringify(parsed);
  } catch {
    return null;
  }
}

function emptyResult(status: NativeReadwiseSourceCutoverPreview['status']): NativeReadwiseSourceCutoverResult {
  return { migrated_count: 0, status: status === 'ready' ? 'failed' : status, unmatched_count: 0 };
}
