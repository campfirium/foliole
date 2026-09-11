import fs from 'node:fs/promises';
import path from 'node:path';

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { extractReadwiseSidecarHighlights, normalizeReadwiseText } from '../../lib/core/import/readwiseReaderParsing.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { extractReaderLinkIds } from '../../lib/core/readwise/readwiseRemoteIdentity.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadReadwiseApiCandidates } from '../database/readwiseApiCandidateStage.js';
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

interface SourceArtifact {
  documentIds: Set<string>;
  highlightIds: Set<string>;
  latestNodeId: string;
  raw: string;
  sourceFingerprint: string | null;
}

export interface ReadwiseSourceCutoverIdentityBinding extends ConfirmedReadwiseIdentityBinding {
  blockedAnnotationIds?: Set<string>;
  nodeId: string;
}

export async function prepareReadwiseSourceCutoverIdentity(connectionRef: string) {
  const artifacts = [...await loadSourceArtifacts(), ...await loadBookArtifacts()];
  const candidates = new Map(loadReadwiseApiCandidates(connectionRef).map((candidate) => [
    candidate.documentId,
    new Set([...candidate.highlightIds, ...(candidate.noteIds ?? [])])
  ]));
  return {
    bindingFor(document: PreparedReadwiseApiDocument): ReadwiseSourceCutoverIdentityBinding | null {
      const remoteHighlights = candidates.get(document.id)
        ?? new Set(document.annotations.map((item) => item.remoteId));
      const matches = artifacts.filter((artifact) => artifact.documentIds.has(document.id) ||
        [...remoteHighlights].some((id) => artifact.highlightIds.has(id)));
      const matchesByNode = new Map<string, SourceArtifact>();
      for (const artifact of matches) {
        const current = matchesByNode.get(artifact.latestNodeId);
        if (!current || (!current.sourceFingerprint && artifact.sourceFingerprint)) {
          matchesByNode.set(artifact.latestNodeId, artifact);
        }
      }
      if (matchesByNode.size > 1) throw new Error('readwise_source_cutover_identity_conflict');
      const match = matchesByNode.values().next().value as SourceArtifact | undefined;
      return match ? bindingFor(match, document) : null;
    }
  };
}

async function loadSourceArtifacts() {
  const rows = openDatabaseConnection().driver.queryAll<SourceRow>(
    `SELECT i.source_fingerprint, i.latest_node_id, i.source_location, d.root_path,
       json_extract(d.type_settings_json, '$.highlightPath') AS highlight_path
     FROM import_sources i JOIN desktop_sources d ON d.source_ref = i.source_ref
     JOIN nodes n ON n.id = i.latest_node_id AND n.deleted_at IS NULL
     WHERE d.source_type = 'readwise' AND d.host_name = ?
       AND i.latest_node_id IS NOT NULL AND i.source_location IS NOT NULL
       AND i.remote_document_id IS NULL ORDER BY i.source_fingerprint`,
    [loadReadwiseHostAssignment().current_host_name]
  );
  return Promise.all(rows.map(async (source): Promise<SourceArtifact> => {
    const relative = safeRelative(source.source_location);
    const full = relative ? await readText(path.resolve(source.root_path, relative)) : '';
    const raw = relative && source.highlight_path
      ? await readText(path.resolve(source.highlight_path, relative)) : '';
    return {
      documentIds: new Set(extractReaderLinkIds(full)),
      highlightIds: new Set(extractReaderLinkIds(raw)),
      latestNodeId: source.latest_node_id,
      raw,
      sourceFingerprint: source.source_fingerprint
    };
  }));
}

async function loadBookArtifacts(): Promise<SourceArtifact[]> {
  const value = openDatabaseConnection().driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'readwise_books_inventory_state'"
  )?.value;
  if (!value) return [];
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(value) as Record<string, unknown>; } catch { return []; }
  const inventories = payload.inventories && typeof payload.inventories === 'object'
    ? Object.values(payload.inventories as Record<string, unknown>) : [];
  const artifacts: SourceArtifact[] = [];
  for (const entry of inventories) {
    const inventory = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    for (const item of Array.isArray(inventory.books) ? inventory.books : []) {
      const book = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      if (typeof book.generatedNodeId !== 'string' || !isActiveNode(book.generatedNodeId)) continue;
      const full = await readText(typeof book.fullDocumentMarkdownPath === 'string' ? book.fullDocumentMarkdownPath : '');
      const raw = await readText(typeof book.highlightMarkdownPath === 'string' ? book.highlightMarkdownPath : '');
      artifacts.push({
        documentIds: new Set(extractReaderLinkIds(full)),
        highlightIds: new Set(extractReaderLinkIds(raw)),
        latestNodeId: book.generatedNodeId,
        raw,
        sourceFingerprint: null
      });
    }
  }
  return artifacts;
}

function isActiveNode(nodeId: string) {
  return Boolean(openDatabaseConnection().driver.queryOne(
    'SELECT id FROM nodes WHERE id = ? AND deleted_at IS NULL',
    [nodeId]
  ));
}

function bindingFor(
  artifact: SourceArtifact,
  document: PreparedReadwiseApiDocument
): ReadwiseSourceCutoverIdentityBinding {
  const ids = extractReaderLinkIds(artifact.raw);
  const highlights = extractReadwiseSidecarHighlights(
    artifact.raw,
    loadStoredReadwiseHostSettings().readwiseReaderConfig
  );
  const annotations = highlights.length === ids.length
    ? highlights.flatMap((highlight, index) => resolveAnnotation(
      artifact.latestNodeId,
      highlight.text,
      document.annotations.find((item) => item.remoteId === ids[index])
    ))
    : [];
  return {
    annotations,
    nodeId: artifact.latestNodeId,
    remoteDocumentId: document.id,
    sourceFingerprint: artifact.sourceFingerprint ?? ''
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
  }>(`WITH RECURSIVE tree(id) AS (
       SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL
       UNION ALL SELECT n.id FROM nodes n JOIN tree t ON n.parent_id = t.id WHERE n.deleted_at IS NULL
     ) SELECT n.id, n.content, n.is_title_manual, n.created_at, n.updated_at FROM nodes n JOIN tree t ON t.id=n.id`,
  [nodeId]);
  const matches = children.filter((child) => child.is_title_manual === 0 && child.created_at === child.updated_at
    && normalizeReadwiseText(child.content) === normalizeReadwiseText(text));
  return matches.length === 1
    ? [{ kind: remote.kind, nodeId: matches[0]!.id, remoteId: remote.remoteId }]
    : [];
}

function safeRelative(value: string) {
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//u, '');
  return !normalized || normalized === '..' || normalized.startsWith('../') || path.isAbsolute(normalized)
    ? null : normalized;
}

async function readText(filePath: string) {
  if (!filePath) return '';
  try { return await fs.readFile(filePath, 'utf8'); } catch { return ''; }
}
