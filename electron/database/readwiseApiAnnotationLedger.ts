import { openDatabaseConnection } from './connection.js';
import {
  ANNOTATION_LEDGER_KIND,
  loadReadwiseApiAnnotationLedger,
  type ReadwiseAnnotationLedgerFact
} from './readwiseApiIndexStage.js';

export function bindReadwiseApiAnnotationParents(
  connectionRef: string,
  documentId: string,
  annotationIds: readonly string[]
) {
  updateFacts(connectionRef, annotationIds, (fact) => resolvedFact(fact, documentId));
}

export function markReadwiseApiAnnotationParentsUnavailable(
  connectionRef: string,
  annotationIds: readonly string[],
  runStartedAt: string
) {
  updateFacts(connectionRef, annotationIds, (fact) => ({
    ...fact,
    resolution: 'parent-and-content-unavailable',
    resolutionRun: runStartedAt
  }));
}

export function markReadwiseApiArticleParentUnavailable(
  connectionRef: string,
  documentId: string,
  runStartedAt: string
) {
  const facts = loadReadwiseApiAnnotationLedger(connectionRef);
  const highlightIds = new Set(facts.filter((fact) =>
    fact.category === 'highlight' && fact.parentId === documentId).map((fact) => fact.remoteId));
  const annotationIds = facts.filter((fact) => highlightIds.has(fact.remoteId)
    || fact.documentId === documentId
    || (fact.category === 'note' && fact.parentId !== null && highlightIds.has(fact.parentId)))
    .map((fact) => fact.remoteId);
  updateFacts(connectionRef, annotationIds, (fact) => ({
    ...fact,
    documentId,
    resolution: 'article-parent-unavailable',
    resolutionRun: runStartedAt
  }));
}

function resolvedFact(fact: ReadwiseAnnotationLedgerFact, documentId: string) {
  const current = { ...fact };
  delete current.resolutionRun;
  return { ...current, documentId, resolution: 'resolved' as const };
}

function updateFacts(
  connectionRef: string,
  annotationIds: readonly string[],
  updateFact: (fact: ReadwiseAnnotationLedgerFact) => ReadwiseAnnotationLedgerFact
) {
  const facts = new Map(loadReadwiseApiAnnotationLedger(connectionRef)
    .map((fact) => [fact.remoteId, fact]));
  const driver = openDatabaseConnection().driver;
  driver.transaction((tx) => {
    const update = tx.prepare(
      `UPDATE readwise_api_import_stage SET payload_json = ?
       WHERE connection_ref = ? AND record_kind = ? AND remote_id = ?`
    );
    for (const remoteId of annotationIds) {
      const fact = facts.get(remoteId);
      if (fact) update.run([JSON.stringify(updateFact(fact)),
        connectionRef, ANNOTATION_LEDGER_KIND, remoteId]);
    }
  });
}
