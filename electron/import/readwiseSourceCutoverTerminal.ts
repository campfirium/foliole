import { loadReadwiseApiCandidates, loadPreparedReadwiseApiCandidate } from '../database/readwiseApiCandidateStage.js';
import {
  loadReadwiseApiAnnotationLedger,
  loadReadwiseApiExportIndex
} from '../database/readwiseApiIndexStage.js';
import { loadReadwiseSourceCutover, writeReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

export function recordReadwiseUnavailableAnnotationTerminals(connectionRef: string) {
  const current = requireActiveCutover();
  const classified = new Set(current.annotations.map((item) => item.remoteId));
  const materializable = materializableAnnotationIds(connectionRef);
  const unavailable = unavailableAnnotationFacts(connectionRef).filter((item) =>
    !classified.has(item.remoteId) && !materializable.has(item.remoteId)
  );
  if (unavailable.length === 0) return current;
  return writeReadwiseSourceCutover({
    ...current,
    annotations: [...current.annotations, ...unavailable.map((item) => ({
      nodeId: null,
      reason: item.reason,
      remoteId: item.remoteId,
      status: 'unavailable' as const
    }))]
  });
}

export function assertReadwiseSourceCutoverComplete(connectionRef: string) {
  const current = requireActiveCutover();
  const candidates = loadReadwiseApiCandidates(connectionRef);
  const candidateIds = new Set(candidates.map((item) => item.documentId));
  if (candidates.some((item) => item.status !== 'completed')) {
    throw new Error('readwise_source_cutover_candidates_incomplete');
  }
  if (!sameSet(candidateIds, new Set(current.cohortDocumentIds))) {
    throw new Error('readwise_source_cutover_cohort_incomplete');
  }
  const documentTerminals = new Set(current.documents.map((item) => item.remoteId));
  if (!sameSet(candidateIds, documentTerminals)) {
    throw new Error('readwise_source_cutover_document_terminals_incomplete');
  }
  const expectedAnnotations = allAnnotationIds(connectionRef);
  const annotationTerminals = new Set(current.annotations.map((item) => item.remoteId));
  if (!sameSet(expectedAnnotations, annotationTerminals)) {
    throw new Error('readwise_source_cutover_annotation_terminals_incomplete');
  }
  if (current.documents.some((item) => item.status === 'suppressed')
    || current.annotations.some((item) => item.status === 'suppressed')) {
    throw new Error('readwise_source_cutover_legacy_suppression_present');
  }
}

export function isReadwiseSourceCutoverActuallyComplete(connectionRef: string) {
  try {
    assertReadwiseSourceCutoverComplete(connectionRef);
    return true;
  } catch {
    return false;
  }
}

function allAnnotationIds(connectionRef: string) {
  return new Set([
    ...materializableAnnotationIds(connectionRef),
    ...unavailableAnnotationFacts(connectionRef).map((item) => item.remoteId)
  ]);
}

function materializableAnnotationIds(connectionRef: string) {
  const ids = new Set<string>();
  for (const candidate of loadReadwiseApiCandidates(connectionRef)) {
    const document = loadPreparedReadwiseApiCandidate(connectionRef, candidate.documentId);
    for (const annotation of document?.annotations ?? []) ids.add(annotation.remoteId);
  }
  return ids;
}

function unavailableAnnotationFacts(connectionRef: string) {
  const facts = loadReadwiseApiAnnotationLedger(connectionRef);
  const ledgerIds = new Set(facts.map((item) => item.remoteId));
  const result = facts.flatMap((item) => {
    if (item.resolution === 'parent-and-content-unavailable'
      || item.resolution === 'article-parent-unavailable') {
      return [{ remoteId: item.remoteId, reason: item.resolution }];
    }
    if (item.contentStatus === 'unavailable') {
      return [{ remoteId: item.remoteId, reason: 'content-unavailable' }];
    }
    return [];
  });
  for (const book of loadReadwiseApiExportIndex(connectionRef)) {
    for (const remoteId of book.highlightExternalIds) {
      if (!ledgerIds.has(remoteId)) {
        result.push({ remoteId, reason: 'unresolvable-without-v3-parent' });
      }
    }
  }
  return uniqueFacts(result);
}

function uniqueFacts(values: Array<{ reason: string; remoteId: string }>) {
  return [...new Map(values.map((item) => [item.remoteId, item])).values()];
}

function requireActiveCutover() {
  const state = loadReadwiseSourceCutover();
  if (!state || state.version !== 2 || state.status !== 'migration-in-progress') {
    throw new Error('readwise_source_migration_not_active');
  }
  return state;
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  return left.size === right.size && [...left].every((item) => right.has(item));
}
