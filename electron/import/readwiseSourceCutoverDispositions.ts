import { openDatabaseConnection } from '../database/connection.js';
import { loadReadwiseApiCandidates } from '../database/readwiseApiCandidateStage.js';
import { migrateReadwiseApiSourceDisposition } from '../database/readwiseApiSourceDispositions.js';
import type { ReadwiseLegacySourceDisposition } from '../database/readwiseLegacySourceDispositions.js';

export interface ReadwiseDispositionArtifact {
  disposition: ReadwiseLegacySourceDisposition | null;
  documentIds: Set<string>;
  highlightIds: Set<string>;
}

export function migrateReadwiseSourceDispositions(
  connectionRef: string,
  documentIds: string[],
  artifacts: ReadwiseDispositionArtifact[]
) {
  const candidates = new Map(loadReadwiseApiCandidates(connectionRef).map((candidate) => [
    candidate.documentId,
    new Set([...candidate.highlightIds, ...(candidate.noteIds ?? [])])
  ]));
  const plan = documentIds.flatMap((documentId) => {
    const annotationIds = candidates.get(documentId) ?? new Set<string>();
    const matches = artifacts.filter((artifact) => artifact.documentIds.has(documentId) ||
      [...annotationIds].some((id) => artifact.highlightIds.has(id)))
      .flatMap((artifact) => artifact.disposition ? [artifact.disposition] : []);
    const unique = new Map(matches.map((item) => [identity(item), item]));
    if (unique.size > 1) throw new Error('readwise_source_disposition_identity_conflict');
    const disposition = unique.values().next().value as ReadwiseLegacySourceDisposition | undefined;
    return disposition ? [{ disposition, documentId }] : [];
  });
  const documentByLegacy = new Map<string, string>();
  for (const item of plan) {
    const key = identity(item.disposition);
    const previous = documentByLegacy.get(key);
    if (previous && previous !== item.documentId) throw new Error('readwise_source_disposition_identity_conflict');
    documentByLegacy.set(key, item.documentId);
  }
  const driver = openDatabaseConnection().driver;
  const updatedAt = new Date().toISOString();
  driver.transaction((tx) => {
    for (const item of plan) {
      migrateReadwiseApiSourceDisposition(
        tx, item.disposition.key, connectionRef, item.documentId,
        item.disposition.disposition, updatedAt
      );
    }
  });
  return new Set(plan.map((item) => item.documentId));
}

function identity(value: ReadwiseLegacySourceDisposition) {
  return `${value.key.sourceKind}\u0000${value.key.sourceScope}\u0000${value.key.originalTitle}`;
}
