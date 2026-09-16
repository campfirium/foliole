import { resolveReaderBodyAncestor, type ReaderDocumentContract } from '../../lib/core/readwise/readwiseApiContract.js';

import type { ReadwiseSourceArtifact } from './readwiseSourceCutoverArtifacts.js';

export interface ReadwiseResolvedSourceArtifact extends ReadwiseSourceArtifact {
  remoteDocumentId: string;
}

export function hasNoReadwiseSourceIdentityEvidence(artifacts: ReadwiseSourceArtifact[]) {
  const relevant = groupArtifacts(artifacts)
    .filter((artifact) => artifact.nodeActive || artifact.disposition);
  return relevant.length > 0 && relevant.every((artifact) =>
    artifact.documentIds.size === 0 && artifact.highlightIds.size === 0);
}

export function resolveReadwiseSourceIdentityIndex(
  artifacts: ReadwiseSourceArtifact[],
  documents: ReadonlyMap<string, ReaderDocumentContract>
) {
  const resolved = groupArtifacts(artifacts).flatMap((artifact) => {
    if (!artifact.nodeActive && !artifact.disposition) return [];
    const ids = new Set([...artifact.documentIds, ...artifact.highlightIds]);
    const ancestors = [...ids].map((id) => resolveReaderBodyAncestor(id, documents));
    const documentIds = new Set(ancestors.flatMap((item) => item.documentId ? [item.documentId] : []));
    if (ids.size === 0 || ancestors.some((item) => !item.documentId) || documentIds.size !== 1) {
      throw new Error('readwise_source_cutover_identity_unmatched');
    }
    return [{ ...artifact, remoteDocumentId: [...documentIds][0]! }];
  });
  const byDocument = new Map<string, ReadwiseResolvedSourceArtifact>();
  for (const artifact of resolved) {
    const previous = byDocument.get(artifact.remoteDocumentId);
    if (previous && previous.latestNodeId !== artifact.latestNodeId) {
      throw new Error('readwise_source_cutover_identity_conflict');
    }
    byDocument.set(artifact.remoteDocumentId, preferArtifact(previous, artifact));
  }
  return { artifacts: resolved, byDocument };
}

function groupArtifacts(artifacts: ReadwiseSourceArtifact[]) {
  const byNode = new Map<string, ReadwiseSourceArtifact>();
  for (const artifact of artifacts) {
    const previous = byNode.get(artifact.latestNodeId);
    if (!previous) {
      byNode.set(artifact.latestNodeId, artifact);
      continue;
    }
    if (previous.disposition && artifact.disposition &&
      dispositionKey(previous.disposition) !== dispositionKey(artifact.disposition)) {
      throw new Error('readwise_source_disposition_identity_conflict');
    }
    byNode.set(artifact.latestNodeId, {
      disposition: previous.disposition ?? artifact.disposition,
      documentIds: new Set([...previous.documentIds, ...artifact.documentIds]),
      highlightIds: new Set([...previous.highlightIds, ...artifact.highlightIds]),
      latestNodeId: artifact.latestNodeId,
      nodeActive: previous.nodeActive || artifact.nodeActive,
      originalUrl: previous.originalUrl ?? artifact.originalUrl ?? null,
      raw: preferredRaw(previous, artifact),
      sourceCategory: previous.sourceCategory ?? artifact.sourceCategory ?? null,
      sourceFingerprint: previous.sourceFingerprint ?? artifact.sourceFingerprint,
      title: previous.title || artifact.title || ''
    });
  }
  return [...byNode.values()];
}

function preferArtifact(
  previous: ReadwiseResolvedSourceArtifact | undefined,
  artifact: ReadwiseResolvedSourceArtifact
) {
  if (!previous) return artifact;
  return previous.sourceFingerprint || !artifact.sourceFingerprint ? previous : artifact;
}

function preferredRaw(left: ReadwiseSourceArtifact, right: ReadwiseSourceArtifact) {
  return left.highlightIds.size >= right.highlightIds.size ? left.raw : right.raw;
}

function dispositionKey(value: NonNullable<ReadwiseSourceArtifact['disposition']>) {
  return JSON.stringify([value.key.sourceKind, value.key.sourceScope, value.key.originalTitle, value.disposition]);
}
