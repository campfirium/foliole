import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { insertImportedHighlightNodes } from '../../lib/core/database/importDerivedHighlights.js';
import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import type { PreparedImportHighlightRecord } from '../../lib/core/import/contract.js';
import { deriveImportedHighlightTitle } from '../../lib/core/import/importGeneratedHighlightText.js';
import { assertNodeTextWithinBudget } from '../../lib/core/nodes/nodeTextBudget.js';
import {
  stableReadwiseAnnotationNodeId,
  type PreparedReadwiseApiAnnotation
} from '../../lib/core/readwise/readwiseApiImport.js';
import type { ReadwiseApiAnnotationState } from '../../lib/core/readwise/readwiseApiImportState.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadReadwiseApiImportSource, saveReadwiseApiImportSource } from '../database/readwiseApiImportState.js';

import { resolveReadwiseApiAnnotationStates } from './readwiseApiAnnotationState.js';
import type { prepareReadwisePdfResyncExport } from './readwisePdfResyncExport.js';
import type { ReadwiseSourceResyncTarget } from './readwiseSourceResyncTarget.js';

interface HighlightRow extends DatabaseRow {
  content: string;
  deleted_at: string | null;
  id: string;
  is_title_manual: number;
  parent_id: string | null;
  title: string;
}

export function persistReadwisePdfResyncAnnotations(
  target: ReadwiseSourceResyncTarget,
  remote: Awaited<ReturnType<typeof prepareReadwisePdfResyncExport>>
) {
  const driver = openDatabaseConnection().driver;
  const source = loadReadwiseApiImportSource(target.connectionRef, target.documentId);
  if (!source || source.nodeId !== target.nodeId) throw new Error('readwise_pdf_target_changed');
  const importedAt = new Date().toISOString();
  const states = new Map(resolveReadwiseApiAnnotationStates(source, importedAt).map(state => [state.remoteId, state]));
  const newHighlights: PreparedImportHighlightRecord[] = [];
  const updatedNodeIds = new Set<string>();
  for (const annotation of remote.annotations) {
    const previous = states.get(annotation.remoteId);
    const nodeId = previous?.nodeId ?? stableReadwiseAnnotationNodeId(target.connectionRef, annotation.remoteId);
    if (previous?.blockedAt || (previous && previous.kind !== 'highlight')) continue;
    const node = driver.queryOne<HighlightRow>(
      'SELECT id, parent_id, content, title, deleted_at, is_title_manual FROM nodes WHERE id = ?', [nodeId]);
    if (node?.deleted_at || (node && node.parent_id !== target.nodeId)) continue;
    if (node && !previous) throw new Error('readwise_pdf_annotation_identity_conflict');
    if (node && previous && !canApplyHighlight(node, previous, annotation)) continue;
    if (!node) {
      newHighlights.push({ content: annotation.content, label: null, locatorText: null, nodeId });
    } else if (node.content !== annotation.content) {
      updateHighlight(driver, node, annotation.content, importedAt);
      updatedNodeIds.add(nodeId);
    }
    states.set(annotation.remoteId, {
      blockedAt: null, contentHash: annotation.contentHash, kind: 'highlight', nodeId,
      parentRemoteId: annotation.parentRemoteId, remoteId: annotation.remoteId,
      remoteStatus: 'present', sourceUpdatedAt: annotation.updatedAt ?? previous?.sourceUpdatedAt ?? null
    });
  }
  insertImportedHighlightNodes({
    driver, highlights: newHighlights, importedAt, parentNodeId: target.nodeId, parentContent: ''
  });
  const annotations = [...states.values()];
  saveReadwiseApiImportSource({
    annotationsJson: JSON.stringify(annotations.map(({ kind, nodeId, remoteId }) => ({ kind, nodeId, remoteId }))),
    connectionRef: target.connectionRef, documentId: target.documentId, sourceFingerprint: source.sourceFingerprint,
    state: { ...source.state, annotations, pdfAnnotationsCheckedAt: remote.startedAt }, updatedAt: importedAt
  });
  return updatedNodeIds;
}

function canApplyHighlight(
  node: HighlightRow,
  previous: ReadwiseApiAnnotationState,
  incoming: PreparedReadwiseApiAnnotation
) {
  if (Date.parse(incoming.updatedAt ?? '') < Date.parse(previous.sourceUpdatedAt ?? '')) return false;
  return node.content === incoming.content || hashTextBody(node.content) === previous.contentHash;
}

function updateHighlight(driver: DatabaseDriver, node: HighlightRow, content: string, updatedAt: string) {
  assertNodeTextWithinBudget(content, 'content');
  const title = node.is_title_manual ? node.title : deriveImportedHighlightTitle(content);
  if (title !== node.title) driver.execute('UPDATE nodes SET title = ? WHERE id = ?', [title, node.id]);
  applyParentContentChange({
    driver, nextContent: content, nodeId: node.id, previousContent: node.content, title, updatedAt
  });
}
