import { createHash } from 'node:crypto';

import { formatHighlightCardContent } from '../../lib/core/annotations/textAnnotationContent.js';
import { extractReadwiseSidecarHighlights, normalizeReadwiseText } from '../../lib/core/import/readwiseReaderParsing.js';
import {
  resolveReaderBodyAncestor,
  type ReaderDocumentContract
} from '../../lib/core/readwise/readwiseApiContract.js';
import {
  prepareReadwiseApiDocuments,
  type PreparedReadwiseApiDocument
} from '../../lib/core/readwise/readwiseApiImport.js';
import { extractReaderLinkIds } from '../../lib/core/readwise/readwiseRemoteIdentity.js';
import { openDatabaseConnection } from '../database/connection.js';
import type { ConfirmedReadwiseIdentityBinding } from '../database/readwiseRemoteIdentity.js';

import { loadStoredReadwiseHostSettings } from './readwiseApiConnectionState.js';
import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import { readReadwiseApiSecret } from './readwiseApiSecret.js';
import {
  fetchReadwiseIdentityDocument,
  fetchReadwiseIdentityDocuments
} from './readwiseIdentityApi.js';
import {
  loadReadwiseSourceArtifacts,
  type ReadwiseSourceArtifact
} from './readwiseSourceCutoverArtifacts.js';
import { migrateReadwiseSourceDispositions } from './readwiseSourceCutoverDispositions.js';
import { resolveReadwiseSourceIdentityIndex } from './readwiseSourceCutoverIdentityIndex.js';

export interface ReadwiseSourceCutoverIdentityBinding extends ConfirmedReadwiseIdentityBinding {
  blockedAnnotationIds?: Set<string>;
  legacyAnnotations: PreparedReadwiseApiDocument['annotations'];
  nodeId: string;
}

export async function prepareReadwiseSourceCutoverIdentity(
  connectionRef: string,
  dependencies: ReadwiseApiFetchDependencies = {}
) {
  const artifacts = await loadReadwiseSourceArtifacts();
  const ids = [...new Set(artifacts.flatMap((artifact) => [
    ...artifact.documentIds, ...artifact.highlightIds
  ]))];
  const secretRef = loadStoredReadwiseHostSettings().apiConnection.secretRef;
  if (ids.length > 0 && !secretRef) throw new Error('readwise_api_token_missing');
  const identity = ids.length > 0 ? await fetchReadwiseIdentityDocuments({
    ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
    ids,
    ...(dependencies.minIntervalMs === undefined ? {} : { minIntervalMs: dependencies.minIntervalMs }),
    token: readReadwiseApiSecret(secretRef!)
  }) : null;
  const documents = identity?.documents ?? new Map<string, ReaderDocumentContract>();
  const index = resolveReadwiseSourceIdentityIndex(artifacts, documents);
  for (const documentId of new Set(index.artifacts.flatMap((artifact) =>
    artifact.nodeActive && !artifact.disposition ? [artifact.remoteDocumentId] : []))) {
    const document = await fetchReadwiseIdentityDocument(documentId, identity!.request, true);
    if (!document) throw new Error('readwise_source_cutover_identity_unmatched');
    documents.set(document.id, document);
  }
  return {
    bindingFor(document: PreparedReadwiseApiDocument): ReadwiseSourceCutoverIdentityBinding | null {
      const match = index.byDocument.get(document.id);
      if (match?.disposition || !match?.nodeActive) return null;
      return match ? bindingFor(match, document, documents) : null;
    },
    assertCandidateCoverage(documentIds: string[]) {
      const candidates = new Set(documentIds);
      if (index.artifacts.some((artifact) => !candidates.has(artifact.remoteDocumentId))) {
        throw new Error('readwise_source_cutover_identity_unmatched');
      }
    },
    candidatePriority(documentId: string) {
      return index.byDocument.has(documentId) ? 0 : 1;
    },
    migrationDocuments() {
      const parentIds = new Set(index.artifacts.map((artifact) => artifact.remoteDocumentId));
      return prepareReadwiseApiDocuments(
        [...documents.values()].filter((document) => parentIds.has(document.id)),
        []
      ).map((document) => {
        const artifact = index.byDocument.get(document.id);
        return artifact ? {
          ...document,
          annotations: legacyAnnotationsFor(artifact, document.id, documents)
        } : document;
      });
    },
    migrateDispositions(documentIds: string[]) {
      return migrateReadwiseSourceDispositions(connectionRef, documentIds, index.artifacts.map((artifact) => ({
        ...artifact,
        documentIds: new Set([artifact.remoteDocumentId])
      })));
    }
  };
}

function bindingFor(
  artifact: ReadwiseSourceArtifact,
  document: PreparedReadwiseApiDocument,
  exactDocuments: ReadonlyMap<string, ReaderDocumentContract>
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
      exactAnnotation(ids[index], document.id, exactDocuments)
    ))
    : [];
  return {
    annotations,
    legacyAnnotations: legacyAnnotationsFor(artifact, document.id, exactDocuments),
    nodeId: artifact.latestNodeId,
    remoteDocumentId: document.id,
    sourceFingerprint: artifact.sourceFingerprint ?? ''
  };
}

function legacyAnnotationsFor(
  artifact: ReadwiseSourceArtifact,
  documentId: string,
  exactDocuments: ReadonlyMap<string, ReaderDocumentContract>
) {
  const ids = extractReaderLinkIds(artifact.raw);
  const highlights = extractReadwiseSidecarHighlights(
    artifact.raw,
    loadStoredReadwiseHostSettings().readwiseReaderConfig
  );
  if (highlights.length !== ids.length) return [];
  return highlights.flatMap((highlight, index) => {
    const remoteId = ids[index];
    const remote = exactAnnotation(remoteId, documentId, exactDocuments);
    if (!remoteId || !remote) return [];
    const content = formatHighlightCardContent({
      ...(highlight.note === undefined ? {} : { note: highlight.note }),
      text: highlight.text
    });
    return [{
      content,
      contentHash: createHash('sha256').update(content).digest('hex'),
      kind: remote.kind,
      locatorText: highlight.text,
      parentRemoteId: documentId,
      remoteId,
      updatedAt: remote.updatedAt
    }];
  });
}

function resolveAnnotation(
  nodeId: string,
  text: string,
  remote: { kind: 'highlight' | 'note'; remoteId: string } | null
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

function exactAnnotation(
  remoteId: string | undefined,
  documentId: string,
  documents: ReadonlyMap<string, ReaderDocumentContract>
) {
  if (!remoteId) return null;
  const fact = documents.get(remoteId);
  if ((fact?.category !== 'highlight' && fact?.category !== 'note')
    || resolveReaderBodyAncestor(remoteId, documents).documentId !== documentId) return null;
  return { kind: fact.category, remoteId, updatedAt: fact.updatedAt };
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
