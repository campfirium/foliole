import fs from 'node:fs/promises';
import path from 'node:path';

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { extractReadwiseSidecarHighlights, normalizeReadwiseText } from '../../lib/core/import/readwiseReaderParsing.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { extractReaderLinkIds } from '../../lib/core/readwise/readwiseRemoteIdentity.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import type { ConfirmedReadwiseIdentityBinding } from '../database/readwiseRemoteIdentity.js';

import { loadStoredReadwiseHostSettings } from './readwiseApiConnectionState.js';

interface SourceRow extends DatabaseRow {
  highlight_path: string;
  latest_node_id: string;
  root_path: string;
  source_fingerprint: string;
  source_location: string;
}

interface SourceArtifact extends SourceRow {
  full: string;
  identityIds: string[];
  raw: string;
}

export async function prepareReadwiseSourceCutoverIdentity() {
  const artifacts = await Promise.all(loadSources().map(readArtifact));
  const byParent = new Map<string, SourceArtifact[]>();
  for (const artifact of artifacts) {
    for (const identityId of artifact.identityIds) {
      const current = byParent.get(identityId) ?? [];
      current.push(artifact);
      byParent.set(identityId, current);
    }
  }
  const matched = new Set<string>();
  const conflicted = new Set<string>();
  return {
    bindingFor(document: PreparedReadwiseApiDocument, connectionRef: string) {
      const candidates = byParent.get(document.id) ?? [];
      const artifact = candidates[0];
      if (!artifact || candidates.length !== 1 || hasStoredConflict(artifact, document.id, connectionRef)) {
        for (const candidate of candidates) conflicted.add(candidate.source_fingerprint);
        return null;
      }
      matched.add(artifact.source_fingerprint);
      return bindingFor(artifact, document);
    },
    conflictCount: () => conflicted.size,
    unmatchedCount: () => artifacts.length - matched.size - conflicted.size
  };
}

function loadSources() {
  return openDatabaseConnection().driver.queryAll<SourceRow>(
    `SELECT i.source_fingerprint, i.latest_node_id, i.source_location, d.root_path,
       json_extract(d.type_settings_json, '$.highlightPath') AS highlight_path
     FROM import_sources i JOIN desktop_sources d ON d.source_ref = i.source_ref
     WHERE d.source_type = 'readwise' AND d.host_name = ?
       AND i.latest_node_id IS NOT NULL AND i.source_location IS NOT NULL
       AND i.remote_document_id IS NULL ORDER BY i.source_fingerprint`,
    [loadReadwiseHostAssignment().current_host_name]
  );
}

async function readArtifact(source: SourceRow): Promise<SourceArtifact> {
  const relative = safeRelative(source.source_location);
  const full = relative ? await readText(path.resolve(source.root_path, relative)) : '';
  const raw = relative && source.highlight_path
    ? await readText(path.resolve(source.highlight_path, relative)) : '';
  return { ...source, full, identityIds: [...new Set(extractReaderLinkIds(full))], raw };
}

function bindingFor(
  artifact: SourceArtifact,
  document: PreparedReadwiseApiDocument
): ConfirmedReadwiseIdentityBinding {
  const ids = extractReaderLinkIds(artifact.raw);
  const highlights = extractReadwiseSidecarHighlights(
    artifact.raw,
    loadStoredReadwiseHostSettings().readwiseReaderConfig
  );
  const annotations = highlights.length === ids.length
    ? highlights.flatMap((highlight, index) => resolveAnnotation(
      artifact.latest_node_id,
      highlight.text,
      document.annotations.find((item) => item.remoteId === ids[index])
    ))
    : [];
  return {
    annotations,
    remoteDocumentId: document.id,
    sourceFingerprint: artifact.source_fingerprint
  };
}

function resolveAnnotation(
  nodeId: string,
  text: string,
  remote: PreparedReadwiseApiDocument['annotations'][number] | undefined
) {
  if (!remote) return [];
  const children = openDatabaseConnection().driver.queryAll<{
    content: string; created_at: string; id: string; is_title_manual: number; updated_at: string;
  }>('SELECT id, content, is_title_manual, created_at, updated_at FROM nodes WHERE parent_id = ? AND deleted_at IS NULL', [nodeId]);
  const matches = children.filter((child) => child.is_title_manual === 0 && child.created_at === child.updated_at
    && normalizeReadwiseText(child.content) === normalizeReadwiseText(text));
  return matches.length === 1
    ? [{ kind: remote.kind, nodeId: matches[0]!.id, remoteId: remote.remoteId }]
    : [];
}

function hasStoredConflict(artifact: SourceArtifact, documentId: string, connectionRef: string) {
  return Boolean(openDatabaseConnection().driver.queryOne(
    `SELECT 1 AS present FROM import_sources WHERE remote_connection_ref = ?
       AND (remote_document_id = ? OR latest_node_id = ?) AND source_fingerprint <> ? LIMIT 1`,
    [connectionRef, documentId, artifact.latest_node_id, artifact.source_fingerprint]
  ));
}

function safeRelative(value: string) {
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//u, '');
  return !normalized || normalized === '..' || normalized.startsWith('../') || path.isAbsolute(normalized)
    ? null : normalized;
}

async function readText(filePath: string) {
  try { return await fs.readFile(filePath, 'utf8'); } catch { return ''; }
}
