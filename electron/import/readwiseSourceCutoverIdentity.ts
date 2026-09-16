import { createHash } from 'node:crypto';

import { formatHighlightCardContent } from '../../lib/core/annotations/textAnnotationContent.js';
import { extractReadwiseSidecarHighlights } from '../../lib/core/import/readwiseReaderParsing.js';
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
  matchReadwiseCutoverAnnotations,
  type LegacyAnnotationCandidate
} from './readwiseSourceCutoverAnnotationMatching.js';
import {
  loadReadwiseSourceArtifacts,
  type ReadwiseSourceArtifact
} from './readwiseSourceCutoverArtifacts.js';
import { migrateReadwiseSourceDispositions } from './readwiseSourceCutoverDispositions.js';
import {
  hasNoReadwiseSourceIdentityEvidence,
  resolveReadwiseSourceIdentityIndex
} from './readwiseSourceCutoverIdentityIndex.js';

export interface ReadwiseSourceCutoverIdentityBinding extends ConfirmedReadwiseIdentityBinding {
  blockedAnnotationIds?: Set<string>;
  legacyAnnotations: PreparedReadwiseApiDocument['annotations'];
  nodeId: string;
}

export async function prepareReadwiseSourceCutoverIdentity(
  connectionRef: string,
  dependencies: ReadwiseApiFetchDependencies = {}
) {
  const artifacts = await requireSourceArtifacts();
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

async function requireSourceArtifacts() {
  const artifacts = await loadReadwiseSourceArtifacts();
  if (hasNoReadwiseSourceIdentityEvidence(artifacts)) {
    throw new Error('readwise_source_cutover_identity_unavailable');
  }
  return artifacts;
}

function bindingFor(
  artifact: ReadwiseSourceArtifact,
  document: PreparedReadwiseApiDocument,
  exactDocuments: ReadonlyMap<string, ReaderDocumentContract>,
  blockedAnnotationIds: ReadonlySet<string> = new Set()
): ReadwiseSourceCutoverIdentityBinding {
  const legacyAnnotations = legacyAnnotationsFor(artifact, document.id, exactDocuments)
    .filter((item) => !blockedAnnotationIds.has(item.remoteId));
  const preparedIds = new Set(document.annotations.map((item) => item.remoteId));
  const matchable = [
    ...document.annotations,
    ...legacyAnnotations.filter((item) => !preparedIds.has(item.remoteId))
  ];
  const annotations = matchReadwiseCutoverAnnotations(
    loadLegacyAnnotationCandidates(artifact.latestNodeId),
    matchable,
    blockedAnnotationIds
  );
  return {
    annotations,
    blockedAnnotationIds: new Set(blockedAnnotationIds),
    legacyAnnotations,
    nodeId: artifact.latestNodeId,
    remoteDocumentId: document.id,
    sourceFingerprint: artifact.sourceFingerprint ?? ''
  };
}

export function createReadwiseSourceCutoverBinding(
  artifact: ReadwiseSourceArtifact,
  document: PreparedReadwiseApiDocument,
  documents: ReadonlyMap<string, ReaderDocumentContract>,
  blockedAnnotationIds: ReadonlySet<string> = new Set()
) {
  return bindingFor(artifact, document, documents, blockedAnnotationIds);
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

function loadLegacyAnnotationCandidates(nodeId: string) {
  return openDatabaseConnection().driver.queryAll<LegacyAnnotationCandidate>(`WITH RECURSIVE tree(id) AS (
       SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL
       UNION ALL SELECT n.id FROM nodes n JOIN tree t ON n.parent_id = t.id WHERE n.deleted_at IS NULL
     ) SELECT n.id, n.title, n.content, n.anchor_link anchorLink,
       n.is_title_manual isTitleManual, n.created_at createdAt,
       (SELECT COUNT(*) FROM nodes child WHERE child.parent_id=n.id AND child.deleted_at IS NULL) childCount
       FROM nodes n JOIN tree t ON t.id=n.id`,
  [nodeId]);
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
