import { createHash } from 'node:crypto';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';
import { enqueueWorkspaceSearchInvalidationForNodeIds } from '../../lib/core/database/searchIndexInvalidations.js';
import { DEFAULT_SUPER_MEMO_SOURCE_FORMAT, type SuperMemoSourceFormat } from '../../lib/core/import/superMemoSourceFormatting.js';
import type { NativeSuperMemoPreviewRow, NativeSuperMemoCitationChange } from '../../lib/platform/nativeSuperMemoImportContract.js';
import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';

import { addSuperMemoCitation, describeSuperMemoCitation, removeSuperMemoCitation, type SuperMemoCitation } from './superMemoCitation.js';

interface CitationEntry {
  id: number;
  nodeId: string | null;
  outcome: NativeSuperMemoPreviewRow['outcome'];
  importedParentNodeId?: string | null;
  importedAnchorLink?: string | null;
  importedCitation?: SuperMemoCitation | null;
  sourceArticleNodeId?: string | null;
}

type Document = { content: string; reveal: string | null };
type CitationNode = Document & { parent_id: string | null; title: string; kind: string; created_at: string; updated_at: string };
type Write = { entry: CitationEntry; nodeId: string; next: Document; previous: Document; citation: SuperMemoCitation | null };

function renderCitationChange(previous: Document, original: SuperMemoCitation | null, proposed: SuperMemoCitation | null) {
  const next = { ...previous };
  if (original) {
    const field = next[original.field];
    if (field === null) return null;
    const removed = removeSuperMemoCitation(field, original);
    if (removed === null) return null;
    next[original.field] = removed;
  }
  if (proposed) {
    const field = next[proposed.field];
    if (!field || field.includes(proposed.text)) return null;
    next[proposed.field] = addSuperMemoCitation(field, proposed, proposed.field);
  }
  return next;
}

export function planSuperMemoCitationUpdates(driver: DatabaseDriver, batch: { entries: CitationEntry[]; sourceFormat?: SuperMemoSourceFormat },
  rows: NativeSuperMemoPreviewRow[], sourceFormat: SuperMemoSourceFormat, parentChanges: ReadonlyMap<string, string | null>,
  additions: ReadonlyMap<number, { pendingId: string }>) {
  const entries = new Map(batch.entries.map(entry => [entry.id, entry]));
  const rowsById = new Map(rows.map(row => [row.id, row]));
  const savedRows = batch.entries as Array<CitationEntry & Partial<NativeSuperMemoPreviewRow>>;
  const savedRowsById = new Map(savedRows.map(row => [row.id, row]));
  const sourcesByNode = new Map(rows.flatMap(row => {
    const id = entries.get(row.id)?.nodeId;
    return id ? [[id, row] as const] : [];
  }));
  const pendingIds = new Set([...additions.values()].map(addition => addition.pendingId));
  const changes: NativeSuperMemoCitationChange[] = [];
  const writes: Write[] = [];
  for (const row of rows) {
    const entry = entries.get(row.id);
    if (!entry?.nodeId || (row.outcome !== 'topic' && row.outcome !== 'item') || row.outcome !== entry.outcome) continue;
    const nodeId = entry.nodeId;
    const node = driver.queryOne<CitationNode>(
      'SELECT content, reveal, parent_id, title, kind, created_at, updated_at FROM nodes WHERE id = ? AND deleted_at IS NULL', [nodeId]);
    if (!node || node.kind !== row.outcome) continue;
    const parent = parentChanges.has(nodeId) ? parentChanges.get(nodeId)! : node.parent_id;
    const article = rowsById.get(row.sourceArticleId ?? 0);
    const articleId = article && entries.get(article.id)?.nodeId;
    const proposed = describeSuperMemoCitation(row, parent ? sourcesByNode.get(parent) : undefined,
      article && articleId ? { id: articleId, title: article.title } : undefined, sourceFormat);
    const oldRow = savedRowsById.get(row.id);
    const oldParentId = entry.importedParentNodeId === undefined ? node.parent_id : entry.importedParentNodeId;
    const oldArticle = savedRowsById.get(oldRow?.sourceArticleId ?? 0);
    const oldLink = entry.sourceArticleNodeId && oldArticle?.title ? { id: entry.sourceArticleNodeId, title: oldArticle.title } : undefined;
    const original = entry.importedCitation === undefined && oldRow?.title !== undefined
      ? describeSuperMemoCitation(oldRow as NativeSuperMemoPreviewRow, oldParentId ? sourcesByNode.get(oldParentId) : undefined,
        oldLink, batch.sourceFormat ?? DEFAULT_SUPER_MEMO_SOURCE_FORMAT) : entry.importedCitation ?? null;
    if (JSON.stringify(original) === JSON.stringify(proposed)) continue;
    const previous = { content: node.content, reveal: node.reveal };
    const unknown = (entry.importedCitation === undefined && !original &&
      (oldRow?.title === undefined || node.created_at !== node.updated_at))
      || (parent !== null && pendingIds.has(parent)) || (article && additions.has(article.id));
    const next = unknown ? null : renderCitationChange(previous, original, proposed);
    changes.push({ sourceId: row.id, title: node.title, status: next ? 'update' : 'protected' });
    if (next) writes.push({ entry, nodeId, next, previous, citation: proposed });
  }
  return { changes, writes, signature: createHash('sha256').update(JSON.stringify(
    writes.map(({ nodeId, previous, next, citation }) => [nodeId, previous, next, citation]))).digest('hex') };
}

export function applySuperMemoCitationUpdates(driver: DatabaseDriver, entries: CitationEntry[], writes: Write[], now: string) {
  const hostName = loadOrCreateDesktopHostName(now);
  const ownedAnchors = new Map(entries.filter(entry => entry.nodeId && entry.importedAnchorLink)
    .map(entry => [entry.nodeId!, entry]));
  for (const { entry, nodeId, next, previous, citation } of writes) {
    const children = previous.content === next.content ? [] : driver.queryAll<{ id: string; anchor_link: string }>(
      'SELECT id, anchor_link FROM nodes WHERE parent_id = ? AND anchor_link IS NOT NULL AND deleted_at IS NULL', [nodeId]);
    const affected = previous.content === next.content ? [] : applyParentContentChange({
      driver, nodeId, nextContent: next.content, previousContent: previous.content, updatedAt: now
    }).affectedChildIds;
    driver.execute('UPDATE nodes SET reveal = ?, sync_dirty = 1, last_modified_by_host_name = ?, updated_at = ? WHERE id = ?',
      [next.reveal, hostName, now, nodeId]);
    enqueueWorkspaceSearchInvalidationForNodeIds(driver, [nodeId]);
    for (const childId of affected) {
      const owned = ownedAnchors.get(childId);
      if (owned && children.find(child => child.id === childId)?.anchor_link === owned.importedAnchorLink) {
        owned.importedAnchorLink = driver.queryOne<{ anchor_link: string | null }>(
          'SELECT anchor_link FROM nodes WHERE id = ?', [childId])?.anchor_link ?? null;
      }
    }
    entry.importedCitation = citation;
  }
}
