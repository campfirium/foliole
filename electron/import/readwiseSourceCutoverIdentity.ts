import { createHash } from 'node:crypto';

import { formatHighlightCardContent } from '../../lib/core/annotations/textAnnotationContent.js';
import { extractReadwiseSidecarHighlights, normalizeReadwiseText } from '../../lib/core/import/readwiseReaderParsing.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { extractReaderLinkIds } from '../../lib/core/readwise/readwiseRemoteIdentity.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadReadwiseApiCandidates } from '../database/readwiseApiCandidateStage.js';
import { loadReadwiseApiAnnotationLedger } from '../database/readwiseApiIndexStage.js';
import type { ConfirmedReadwiseIdentityBinding } from '../database/readwiseRemoteIdentity.js';

import { loadStoredReadwiseHostSettings } from './readwiseApiConnectionState.js';
import { buildReadwiseBookPlaceholderNodeIdFromTitle } from './readwiseBookNodes.js';
import {
  loadReadwiseSourceArtifacts,
  type ReadwiseSourceArtifact
} from './readwiseSourceCutoverArtifacts.js';
import { migrateReadwiseSourceDispositions } from './readwiseSourceCutoverDispositions.js';

export interface ReadwiseSourceCutoverIdentityBinding extends ConfirmedReadwiseIdentityBinding {
  blockedAnnotationIds?: Set<string>;
  legacyAnnotations: PreparedReadwiseApiDocument['annotations'];
  nodeId: string;
}

export async function prepareReadwiseSourceCutoverIdentity(connectionRef: string) {
  const artifacts = await loadReadwiseSourceArtifacts();
  return {
    bindingFor(document: PreparedReadwiseApiDocument): ReadwiseSourceCutoverIdentityBinding | null {
      const matches = matchingArtifacts(
        document.id,
        new Set(document.annotations.map((item) => item.remoteId)),
        artifacts,
        connectionRef
      ).filter((artifact) => artifact.nodeActive && !artifact.disposition);
      const matchesByNode = new Map<string, ReadwiseSourceArtifact>();
      for (const artifact of matches) {
        const current = matchesByNode.get(artifact.latestNodeId);
        if (!current || (!current.sourceFingerprint && artifact.sourceFingerprint)) {
          matchesByNode.set(artifact.latestNodeId, artifact);
        }
      }
      if (matchesByNode.size > 1) throw new Error('readwise_source_cutover_identity_conflict');
      const matched = matchesByNode.values().next().value as ReadwiseSourceArtifact | undefined;
      const match = matched ?? legacyBookArtifact(document);
      return match ? bindingFor(match, document, loadReadwiseApiAnnotationLedger(connectionRef)) : null;
    },
    migrateDispositions(documentIds: string[]) {
      return migrateReadwiseSourceDispositions(connectionRef, documentIds, artifacts);
    }
  };
}

function legacyBookArtifact(document: PreparedReadwiseApiDocument): ReadwiseSourceArtifact | null {
  if (document.category !== 'epub') return null;
  const nodeId = buildReadwiseBookPlaceholderNodeIdFromTitle(document.title);
  const row = openDatabaseConnection().driver.queryOne<{ id: string }>(
    `SELECT book.id FROM nodes book JOIN nodes folder ON folder.id=book.parent_id
     WHERE book.id=? AND book.deleted_at IS NULL AND folder.deleted_at IS NULL
       AND folder.kind='folder' AND lower(folder.title)='books'`,
    [nodeId]
  );
  return row ? {
    disposition: null,
    documentIds: new Set([document.id]),
    highlightIds: new Set(),
    latestNodeId: row.id,
    nodeActive: true,
    raw: '',
    sourceFingerprint: null
  } : null;
}

function matchingArtifacts(
  documentId: string,
  fallbackAnnotationIds: Set<string>,
  artifacts: ReadwiseSourceArtifact[],
  connectionRef: string
) {
  const candidate = loadReadwiseApiCandidates(connectionRef).find((item) => item.documentId === documentId);
  const annotationIds = candidate
    ? new Set([...candidate.highlightIds, ...(candidate.noteIds ?? [])])
    : fallbackAnnotationIds;
  return artifacts.filter((artifact) => artifact.documentIds.has(documentId) ||
    [...annotationIds].some((id) => artifact.highlightIds.has(id)));
}

function bindingFor(
  artifact: ReadwiseSourceArtifact,
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
