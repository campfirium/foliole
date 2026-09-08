import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { extractReadwiseSidecarHighlights, normalizeReadwiseText } from '../../lib/core/import/readwiseReaderParsing.js';
import { resolveReaderBodyAncestor } from '../../lib/core/readwise/readwiseApiContract.js';
import { extractReaderLinkIds } from '../../lib/core/readwise/readwiseRemoteIdentity.js';
import type {
  NativeReadwiseIdentityBindingPreview,
  NativeReadwiseIdentityBindingResult
} from '../../lib/platform/nativeReadwiseIdentityContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import {
  confirmReadwiseIdentityBindings,
  loadReadwiseRemoteSource,
  type ConfirmedReadwiseIdentityBinding
} from '../database/readwiseRemoteIdentity.js';

import { loadStoredReadwiseHostSettings, isStoredReadwiseApiConnectionReady } from './readwiseApiConnectionState.js';
import { readReadwiseApiSecret } from './readwiseApiSecret.js';
import { fetchReadwiseIdentityEvidence } from './readwiseIdentityApi.js';

interface SourceRow extends DatabaseRow {
  highlight_path: string;
  latest_node_id: string;
  root_path: string;
  source_fingerprint: string;
  source_location: string;
}

interface PreviewCache {
  bindings: ConfirmedReadwiseIdentityBinding[];
  connectionRef: string;
  createdAt: number;
}

export interface PreparedReadwiseIdentityBindings {
  bindings: ConfirmedReadwiseIdentityBinding[];
  conflictCount: number;
  unmatchedCount: number;
}

const previews = new Map<string, PreviewCache>();

export async function previewReadwiseIdentityBindings(options: {
  fetchImpl?: typeof fetch;
  minIntervalMs?: number;
} = {}): Promise<NativeReadwiseIdentityBindingPreview> {
  const blocked = readinessResult(false);
  if (blocked) return blocked;
  const settings = loadStoredReadwiseHostSettings();
  const remoteSource = loadReadwiseRemoteSource();
  if (!remoteSource || !settings.apiConnection.secretRef) return empty('connection_missing');
  try {
    const sources = await loadReadableSources(loadReadwiseHostAssignment().current_host_name);
    const artifacts = await Promise.all(sources.map(readSourceArtifact));
    const ids = [...new Set(artifacts.flatMap((item) => item.ids))];
    const evidence = await fetchReadwiseIdentityEvidence({
      ...options, ids, token: readReadwiseApiSecret(settings.apiConnection.secretRef)
    });
    const resolved = artifacts.map((artifact) => resolveBinding(artifact, evidence));
    const bindings = resolved.flatMap((item) => item.binding ? [item.binding] : []);
    const previewId = `readwise-binding-${randomUUID()}`;
    previews.set(previewId, { bindings, connectionRef: remoteSource.connectionRef, createdAt: Date.now() });
    prunePreviews();
    return {
      annotation_count: bindings.reduce((total, item) => total + item.annotations.length, 0),
      candidate_count: bindings.length,
      conflict_count: resolved.filter((item) => item.reason === 'conflict').length,
      preview_id: previewId,
      status: 'ready',
      unmatched_count: resolved.filter((item) => !item.binding && item.reason !== 'conflict').length
    };
  } catch {
    return empty('unavailable');
  }
}

export async function prepareReadwiseIdentityBindingsForCutover(options: {
  fetchImpl?: typeof fetch;
  minIntervalMs?: number;
} = {}): Promise<PreparedReadwiseIdentityBindings> {
  const blocked = readinessResult(true);
  if (blocked) throw new Error(blocked.status);
  const settings = loadStoredReadwiseHostSettings();
  const remoteSource = loadReadwiseRemoteSource();
  if (!remoteSource || !settings.apiConnection.secretRef) throw new Error('connection_missing');
  const sources = await loadReadableSources(loadReadwiseHostAssignment().current_host_name);
  const artifacts = await Promise.all(sources.map(readSourceArtifact));
  const ids = [...new Set(artifacts.flatMap((item) => item.ids))];
  const evidence = await fetchReadwiseIdentityEvidence({
    ...options,
    ids,
    token: readReadwiseApiSecret(settings.apiConnection.secretRef)
  });
  const resolved = artifacts.map((artifact) => resolveBinding(artifact, evidence));
  return {
    bindings: resolved.flatMap((item) => item.binding ? [item.binding] : []),
    conflictCount: resolved.filter((item) => item.reason === 'conflict').length,
    unmatchedCount: resolved.filter((item) => !item.binding && item.reason !== 'conflict').length
  };
}

export function confirmReadwiseIdentityBindingPreview(previewId: string): NativeReadwiseIdentityBindingResult {
  const preview = previews.get(previewId);
  previews.delete(previewId);
  if (!preview || Date.now() - preview.createdAt > 10 * 60_000) return result('preview_expired');
  if (loadReadwiseRemoteSource()?.connectionRef !== preview.connectionRef) return result('connection_changed');
  try {
    confirmReadwiseIdentityBindings(preview.connectionRef, preview.bindings);
    return {
      annotation_count: preview.bindings.reduce((total, item) => total + item.annotations.length, 0),
      bound_count: preview.bindings.length,
      status: 'bound'
    };
  } catch {
    return result('unavailable');
  }
}

function readinessResult(allowFolderMode: boolean): NativeReadwiseIdentityBindingPreview | null {
  if (!loadReadwiseHostAssignment().is_active) return empty('not_active_host');
  if (!allowFolderMode && loadStoredReadwiseHostSettings().readwiseSourceMode !== 'api') {
    return empty('source_mode_mismatch');
  }
  return isStoredReadwiseApiConnectionReady() ? null : empty('connection_missing');
}

function loadReadableSources(hostName: string) {
  return openDatabaseConnection().driver.queryAll<SourceRow>(
    `SELECT i.source_fingerprint, i.latest_node_id, i.source_location, d.root_path,
       json_extract(d.type_settings_json, '$.highlightPath') AS highlight_path
     FROM import_sources i JOIN desktop_sources d ON d.source_ref = i.source_ref
     WHERE d.source_type = 'readwise' AND d.host_name = ?
       AND i.latest_node_id IS NOT NULL AND i.source_location IS NOT NULL
       AND i.remote_document_id IS NULL ORDER BY i.source_fingerprint`
    , [hostName]
  );
}

async function readSourceArtifact(source: SourceRow) {
  const relative = safeRelative(source.source_location);
  const full = relative ? await readText(path.resolve(source.root_path, relative)) : '';
  const raw = relative && source.highlight_path
    ? await readText(path.resolve(source.highlight_path, relative)) : '';
  return { ...source, full, ids: extractReaderLinkIds(raw || full), raw };
}

function resolveBinding(
  artifact: Awaited<ReturnType<typeof readSourceArtifact>>,
  evidence: Awaited<ReturnType<typeof fetchReadwiseIdentityEvidence>>
) {
  const ancestors = artifact.ids.map((id) => resolveReaderBodyAncestor(id, evidence.documents));
  const documentIds = new Set(ancestors.flatMap((item) => item.documentId ? [item.documentId] : []));
  if (!artifact.ids.length || ancestors.some((item) => !item.documentId) || documentIds.size !== 1) {
    return { binding: null, reason: 'unmatched' as const };
  }
  const remoteDocumentId = [...documentIds][0]!;
  if (!evidence.exportIds.has(remoteDocumentId)) {
    return { binding: null, reason: 'unmatched' as const };
  }
  if (hasBindingConflict(artifact, remoteDocumentId)) {
    return { binding: null, reason: 'conflict' as const };
  }
  return {
    binding: {
      annotations: resolveAnnotations(artifact, evidence.documents),
      remoteDocumentId,
      sourceFingerprint: artifact.source_fingerprint
    },
    reason: 'candidate' as const
  };
}

function resolveAnnotations(
  artifact: Awaited<ReturnType<typeof readSourceArtifact>>,
  documents: Awaited<ReturnType<typeof fetchReadwiseIdentityEvidence>>['documents']
) {
  const settings = loadStoredReadwiseHostSettings();
  const highlights = extractReadwiseSidecarHighlights(artifact.raw, settings.readwiseReaderConfig);
  if (highlights.length !== artifact.ids.length) return [];
  const children = openDatabaseConnection().driver.queryAll<{
    content: string; created_at: string; id: string; is_title_manual: number; updated_at: string;
  }>(`SELECT id, content, is_title_manual, created_at, updated_at FROM nodes
    WHERE parent_id = ? AND deleted_at IS NULL`, [artifact.latest_node_id]);
  return highlights.flatMap((highlight, index) => {
    const remote = documents.get(artifact.ids[index]!);
    const matches = children.filter((child) => child.is_title_manual === 0 && child.created_at === child.updated_at &&
      normalizeReadwiseText(child.content) === normalizeReadwiseText(highlight.text));
    return remote && matches.length === 1 && (remote.category === 'highlight' || remote.category === 'note')
      ? [{ kind: remote.category, nodeId: matches[0]!.id, remoteId: remote.id }] : [];
  });
}

function hasBindingConflict(artifact: SourceRow, remoteDocumentId: string) {
  const source = loadReadwiseRemoteSource();
  if (!source) return true;
  const row = openDatabaseConnection().driver.queryOne(
    `SELECT 1 AS present FROM import_sources WHERE remote_connection_ref = ?
       AND (remote_document_id = ? OR latest_node_id = ?) AND source_fingerprint <> ? LIMIT 1`,
    [source.connectionRef, remoteDocumentId, artifact.latest_node_id, artifact.source_fingerprint]
  );
  return Boolean(row);
}

function safeRelative(value: string) {
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//u, '');
  return !normalized || normalized === '..' || normalized.startsWith('../') || path.isAbsolute(normalized)
    ? null : normalized;
}

async function readText(filePath: string) {
  try { return await fs.readFile(filePath, 'utf8'); } catch { return ''; }
}

function empty(status: NativeReadwiseIdentityBindingPreview['status']): NativeReadwiseIdentityBindingPreview {
  return { annotation_count: 0, candidate_count: 0, conflict_count: 0, preview_id: null, status, unmatched_count: 0 };
}

function result(status: NativeReadwiseIdentityBindingResult['status']): NativeReadwiseIdentityBindingResult {
  return { annotation_count: 0, bound_count: 0, status };
}

function prunePreviews() {
  for (const [id, preview] of previews) if (Date.now() - preview.createdAt > 10 * 60_000) previews.delete(id);
}
