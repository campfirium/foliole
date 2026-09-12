import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { formatHighlightCardContent } from '../../lib/core/annotations/textAnnotationContent.js';
import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { extractReadwiseSidecarHighlights, normalizeReadwiseText } from '../../lib/core/import/readwiseReaderParsing.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { extractReaderLinkIds } from '../../lib/core/readwise/readwiseRemoteIdentity.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadReadwiseApiCandidates } from '../database/readwiseApiCandidateStage.js';
import { loadReadwiseApiAnnotationLedger } from '../database/readwiseApiIndexStage.js';
import { loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import type { ConfirmedReadwiseIdentityBinding } from '../database/readwiseRemoteIdentity.js';

import { loadStoredReadwiseHostSettings } from './readwiseApiConnectionState.js';

interface SourceRow extends DatabaseRow {
  highlight_path: string;
  latest_node_id: string;
  root_path: string;
  remote_document_id: string | null;
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
  legacyAnnotations: PreparedReadwiseApiDocument['annotations'];
  nodeId: string;
}

export async function prepareReadwiseSourceCutoverIdentity(connectionRef: string) {
  const artifacts = [...await loadSourceArtifacts(), ...await loadBookArtifacts()];
  return {
    bindingFor(document: PreparedReadwiseApiDocument): ReadwiseSourceCutoverIdentityBinding | null {
      const candidates = new Map(loadReadwiseApiCandidates(connectionRef).map((candidate) => [
        candidate.documentId,
        new Set([...candidate.highlightIds, ...(candidate.noteIds ?? [])])
      ]));
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
      return match ? bindingFor(match, document, loadReadwiseApiAnnotationLedger(connectionRef)) : null;
    }
  };
}

async function loadSourceArtifacts() {
  const rows = openDatabaseConnection().driver.queryAll<SourceRow>(
    `SELECT i.source_fingerprint, i.latest_node_id, i.source_location, i.remote_document_id, d.root_path,
       json_extract(d.type_settings_json, '$.highlightPath') AS highlight_path
     FROM import_sources i JOIN desktop_sources d ON d.source_ref = i.source_ref
     JOIN nodes n ON n.id = i.latest_node_id AND n.deleted_at IS NULL
     WHERE d.source_type = 'readwise' AND d.host_name = ?
       AND i.latest_node_id IS NOT NULL AND i.source_location IS NOT NULL
     ORDER BY i.source_fingerprint`,
    [loadReadwiseHostAssignment().current_host_name]
  );
  return Promise.all(rows.map(async (source): Promise<SourceArtifact> => {
    const relative = safeRelative(source.source_location);
    const full = relative ? await readText(path.resolve(source.root_path, relative)) : '';
    const raw = relative && source.highlight_path
      ? await readText(path.resolve(source.highlight_path, relative)) : '';
    return {
      documentIds: new Set([...extractReaderLinkIds(full), ...(source.remote_document_id
        ? [source.remote_document_id] : [])]),
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
      const remote = openDatabaseConnection().driver.queryOne<{ remote_document_id: string }>(
        `SELECT remote_document_id FROM import_sources WHERE latest_node_id = ?
         AND remote_provider = 'readwise' AND remote_document_id IS NOT NULL`,
        [book.generatedNodeId]
      );
      artifacts.push({
        documentIds: new Set([...extractReaderLinkIds(full), ...(remote ? [remote.remote_document_id] : [])]),
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
  document: PreparedReadwiseApiDocument,
  annotationFacts: ReturnType<typeof loadReadwiseApiAnnotationLedger>
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
    legacyAnnotations: highlights.length === ids.length ? highlights.flatMap((highlight, index) => {
      const remoteId = ids[index];
      const remote = remoteId ? document.annotations.find((item) => item.remoteId === remoteId) : null;
      const fact = remoteId ? annotationFacts.find((item) => item.remoteId === remoteId) : null;
      const confirmedFallback = fact?.category === 'highlight'
        && (fact.documentId === document.id || fact.parentId === document.id);
      if (!remoteId || (!remote && !confirmedFallback)) return [];
      const content = formatHighlightCardContent({
        ...(highlight.note === undefined ? {} : { note: highlight.note }),
        text: highlight.text
      });
      return [{
        content,
        contentHash: createHash('sha256').update(content).digest('hex'),
        kind: 'highlight' as const,
        locatorText: highlight.text,
        parentRemoteId: document.id,
        remoteId,
        updatedAt: remote?.updatedAt ?? fact?.updatedAt ?? null
      }];
    }) : [],
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
    anchor_link: string | null; content: string; created_at: string; id: string;
    is_title_manual: number; title: string; updated_at: string;
  }>(`WITH RECURSIVE tree(id) AS (
       SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL
       UNION ALL SELECT n.id FROM nodes n JOIN tree t ON n.parent_id = t.id WHERE n.deleted_at IS NULL
     ) SELECT n.id, n.title, n.content, n.anchor_link, n.is_title_manual, n.created_at, n.updated_at
       FROM nodes n JOIN tree t ON t.id=n.id`,
  [nodeId]);
  const matches = children.filter((child) => child.is_title_manual === 0 && child.created_at === child.updated_at
    && normalizeReadwiseText(resolveLegacyHighlightText(child)) === normalizeReadwiseText(text));
  return matches.length === 1
    ? [{ kind: remote.kind, nodeId: matches[0]!.id, remoteId: remote.remoteId }]
    : [];
}

function resolveLegacyHighlightText(child: { anchor_link: string | null; content: string; title: string }) {
  if (child.anchor_link) {
    try {
      const parsed = JSON.parse(child.anchor_link) as { locator?: { originalText?: unknown } };
      if (typeof parsed.locator?.originalText === 'string' && parsed.locator.originalText.trim()) {
        return parsed.locator.originalText;
      }
    } catch {
      // Fall through to legacy node fields when the stored anchor is malformed.
    }
  }
  return child.content.trim() ? child.content : child.title;
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
