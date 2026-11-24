import { createHash } from 'node:crypto';

import { INBOX_NODE_ID } from '../../lib/core/database/specialNodeIds.js';
import { loadWorkspaceNodeDocument } from '../../lib/core/database/workspaceNodeDocument.js';
import { orderSuperMemoImportWrites, orderSuperMemoSourceRows, planSuperMemoImportParents } from '../../lib/core/import/superMemoImportParents.js';
import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';
import type { NativeSuperMemoDirectoryUpdate, NativeSuperMemoPreview, NativeSuperMemoPreviewArgs } from '../../lib/platform/nativeSuperMemoImportContract.js';
import { openDatabaseConnection } from '../database/connection.js';

import { applySuperMemoBatchStructure, type AdditionWriter, type Batch, type BatchEntry } from './applySuperMemoBatchStructure.js';
import type { SuperMemoDirectoryMove } from './applySuperMemoDirectoryMoves.js';
import { applySuperMemoCitationUpdates, applySuperMemoRuleCorrections, planSuperMemoCitationUpdates } from './planSuperMemoCitationUpdates.js';
import { applySuperMemoFirstReviewUpdates, planSuperMemoFirstReviewUpdates } from './planSuperMemoFirstReviewUpdates.js';
import { createSuperMemoMissingAnchorPlanner } from './planSuperMemoMissingAnchor.js';
import { applySuperMemoPriorityUpdates, planSuperMemoPriorityUpdates } from './planSuperMemoPriorityUpdates.js';
import { persistSuperMemoExportLink, resolveSuperMemoBatch, type SuperMemoUpdateTarget } from './resolveSuperMemoBatch.js';
import { prepareSuperMemoRows, type runSuperMemoImport, writeSuperMemoRows } from './runSuperMemoImport.js';
import { createSuperMemoAnchorReparentPlanner, type ReparentedSuperMemoAnchor } from './superMemoAnchorReparent.js';
import { createPendingParentRenderer, listSuperMemoRequiredParents, type PendingParentContent } from './superMemoPendingParent.js';
import { applySuperMemoWithdrawals, planSuperMemoWithdrawals, selectSuperMemoWithdrawals } from './superMemoWithdrawals.js';

type LiveNode = {
  parent_id: string | null;
  kind: string;
  created_at: string;
  updated_at: string;
  anchor_link: string | null;
  anchor_resolution_status: string | null;
  image_regions: string | null;
  deleted_at: string | null;
  virtual_filter: string | null;
  title: string;
};

type PlannedMove = SuperMemoDirectoryMove & { entry: BatchEntry };
type UpdateStatus = NativeSuperMemoDirectoryUpdate['changes'][number]['status'];

type UpdateOptions = SuperMemoUpdateTarget & Pick<NativeSuperMemoPreviewArgs, 'updatePercent' | 'priorityBoundaries'> & { ruleCorrectionsOnly?: true };
type ImportInput = Parameters<typeof runSuperMemoImport>[0] & UpdateOptions;

function canMove(nodeId: string, parentId: string | null, read: (id: string) => LiveNode | undefined,
  projectedParents: ReadonlyMap<string, string | null>) {
  const visited = new Set([nodeId]);
  for (let id = parentId; id !== null;) {
    const ancestor = read(id);
    if (!ancestor && id === INBOX_NODE_ID) return true;
    if (!ancestor || ancestor.deleted_at || ancestor.virtual_filter || visited.has(id)) return false;
    visited.add(id);
    id = projectedParents.has(id) ? projectedParents.get(id)! : ancestor.parent_id;
  }
  return true;
}

function createNodeLookup(driver: ReturnType<typeof openDatabaseConnection>['driver']) {
  const lookup = new Map<string, LiveNode | undefined>();
  const read = (id: string) => {
    if (!lookup.has(id)) lookup.set(id, driver.queryOne<LiveNode>(
      'SELECT parent_id, kind, created_at, updated_at, anchor_link, anchor_resolution_status, image_regions, deleted_at, virtual_filter, title FROM nodes WHERE id = ?', [id]) ?? undefined);
    return lookup.get(id);
  };
  return { lookup, read };
}

function classifyMove(planAnchor: ReturnType<typeof createSuperMemoAnchorReparentPlanner>, entry: BatchEntry, node: LiveNode | undefined,
  allowedTarget: boolean, target: string | null | undefined): { status: UpdateStatus; anchor?: ReparentedSuperMemoAnchor } {
  if (!node || node.deleted_at || node.virtual_filter || node.kind !== entry.outcome) return { status: 'protected' };
  const untouched = node.created_at === node.updated_at;
  const originalParent = entry.importedParentNodeId === undefined ? untouched : node.parent_id === entry.importedParentNodeId;
  const originalAnchor = entry.importedAnchorLink === undefined ? untouched : node.anchor_link === entry.importedAnchorLink;
  if (!originalParent || ((node.anchor_link || entry.importedAnchorLink) && !originalAnchor)) return { status: 'protected' };
  if (!allowedTarget) return { status: 'unavailable' };
  if (!node.anchor_link) return { status: 'move' };
  const anchor = node.parent_id && target && !node.image_regions && !node.anchor_resolution_status?.startsWith('unmapped_')
    ? planAnchor(node.anchor_link, node.parent_id, target) : null;
  return anchor ? { status: 'move', anchor } : { status: 'anchor-unverified' };
}

function planAddition(row: NativeSuperMemoPreview['rows'][number], target: string | null | undefined,
  targetNode: LiveNode | undefined, targetKindValid: boolean, missingParent: boolean,
  context: ReturnType<typeof createNodeLookup> & {
    additions: Map<number, { pendingId: string; target: string | null }>;
    projectedParents: ReadonlyMap<string, string | null>;
  }): NativeSuperMemoDirectoryUpdate['changes'][number] {
  const pendingId = `supermemo-pending:${row.id}`;
  const canAdd = target !== undefined && targetKindValid && canMove(pendingId, target, context.read, context.projectedParents);
  if (canAdd && target !== undefined) {
    context.additions.set(row.id, { pendingId, target });
    context.lookup.set(pendingId, { parent_id: target, kind: row.outcome, title: row.title, created_at: '', updated_at: '',
      anchor_link: null, anchor_resolution_status: null, image_regions: null, deleted_at: null, virtual_filter: null });
  }
  return { sourceId: row.id, title: row.title, from: null, to: targetNode?.title ?? null,
    status: canAdd ? 'add' : 'add-unavailable', ...(missingParent ? { missingParent: true } : {}),
    ...(target === INBOX_NODE_ID ? { toInbox: true } : {}) };
}

function planMoves(batch: Batch, preview: NativeSuperMemoPreview, elements: SuperMemoXmlDraftElement[], content?: PendingParentContent) {
  const { driver } = openDatabaseConnection();
  const renderNewParent = content && createPendingParentRenderer(elements, preview, content);
  const recoverAnchor = content && createSuperMemoMissingAnchorPlanner(driver, elements, content.expectedImages, preview.rows);
  const rows = orderSuperMemoSourceRows(preview.rows);
  const parents = planSuperMemoImportParents(rows);
  const entries = new Map(batch.entries.map(entry => [entry.id, entry]));
  const required = listSuperMemoRequiredParents(rows, parents, entries);
  const additions = new Map<number, { pendingId: string; target: string | null }>();
  const { lookup, read } = createNodeLookup(driver);
  const existingNodeIds = new Map(rows.flatMap(row => {
    const id = entries.get(row.id)?.nodeId;
    const node = id ? read(id) : undefined;
    return id && node && !node.deleted_at && !node.virtual_filter && node.kind === row.outcome ? [[row.id, id] as const] : [];
  }));
  const pendingBodies = new Map<string, string>();
  const planAnchor = createSuperMemoAnchorReparentPlanner(driver, pendingBodies);
  const projectedParents = new Map<string, string | null>();
  const changes: NativeSuperMemoDirectoryUpdate['changes'] = [];
  const moves: PlannedMove[] = [];
  for (const { row } of orderSuperMemoImportWrites(rows.map(row => ({ row })), parents)) {
    const entry = entries.get(row.id);
    if (!entry) continue;
    const targetSource = parents.get(row.id);
    const target = targetSource == null ? batch.rootNodeId ?? (row.outcome === 'folder' ? null : INBOX_NODE_ID)
      : existingNodeIds.get(targetSource) ?? additions.get(targetSource)?.pendingId;
    const targetNode = target ? read(target) : undefined;
    const targetKindValid = !targetNode || targetNode.kind === 'folder' ||
      (targetNode.kind === 'topic' && row.outcome !== 'folder');
    if (!entry.nodeId && entry.outcome === 'skipped' && row.outcome !== 'skipped') {
      changes.push(planAddition(row, target, targetNode, targetKindValid, required.has(row.id),
        { additions, lookup, read, projectedParents }));
    }
    if (!entry.nodeId || entry.outcome !== row.outcome) continue;
    const node = read(entry.nodeId);
    const sameParent = node && target === node.parent_id;
    const recoverable = node && targetSource != null && target && targetKindValid &&
      !node.deleted_at && !node.virtual_filter && !node.image_regions && !node.anchor_link &&
      node.parent_id === entry.importedParentNodeId &&
      (targetSource === row.parentId || targetSource === row.sourceArticleId);
    const restored = recoverable ? recoverAnchor?.(entry, targetSource, target, entries.get(targetSource)) : null;
    if (sameParent && !restored) continue;
    const allowedTarget = target !== undefined && targetKindValid && canMove(entry.nodeId, target, read, projectedParents);
    if (node?.anchor_link && targetSource != null && target && additions.has(targetSource) && !pendingBodies.has(target)) {
      const body = renderNewParent?.(targetSource, existingNodeIds, additions, entries);
      if (body !== undefined) pendingBodies.set(target, body);
    }
    const result = classifyMove(planAnchor, entry, node, allowedTarget, target);
    const status = sameParent && result.status === 'move' ? 'anchor' : result.status;
    const anchor = result.status === 'move' ? restored ?? result.anchor : undefined;
    changes.push({ sourceId: row.id, title: node?.title ?? row.title,
      from: node?.parent_id ? read(node.parent_id)?.title ?? null : null, to: targetNode?.title ?? null, status,
      ...(restored && anchor ? { restoreAnchor: true } : anchor ? { reanchor: true } : {}) });
    if ((status === 'move' || status === 'anchor') && node && target !== undefined) {
      moves.push({ entry, nodeId: entry.nodeId, from: node.parent_id, to: target, ...(anchor ? { anchor } : {}) });
      projectedParents.set(entry.nodeId, target);
    }
  }
  return { changes, moves, additions, existingNodeIds, rows };
}

function persistFirstReviewWeight(batch: Batch, percent: number) {
  // Existing dates still use their previous basis until an eligible write replaces it.
  for (const entry of batch.entries) {
    if (entry.outcome === 'item' && entry.lastApplied) entry.appliedPercent ??= batch.percent;
  }
  batch.percent = percent;
}

function persistRuleCorrections(driver: ReturnType<typeof openDatabaseConnection>['driver'], key: string,
  batch: Batch, plan: ReturnType<typeof planSuperMemoCitationUpdates> | undefined) {
  const now = new Date().toISOString();
  if (plan && applySuperMemoRuleCorrections(driver, batch.entries, plan.writes, now)) {
    driver.execute('UPDATE workspace_meta SET value = ?, updated_at = ? WHERE key = ?', [JSON.stringify(batch), now, key]);
  }
}

function planBatchCitationUpdates(driver: ReturnType<typeof openDatabaseConnection>['driver'], batch: Batch,
  plan: ReturnType<typeof planMoves>, content: PendingParentContent, elements: SuperMemoXmlDraftElement[]) {
  return planSuperMemoCitationUpdates(driver, batch, plan.rows, content, elements,
    new Map(plan.moves.map(move => [move.nodeId, move.to])), plan.additions,
    new Set([
      ...plan.moves.flatMap(move => move.anchor && move.to ? [move.to] : []),
      ...[...plan.additions.values()].flatMap(addition => addition.target ? [addition.target] : [])
    ]));
}

export function updateSuperMemoDirectories(elements: SuperMemoXmlDraftElement[], preview: NativeSuperMemoPreview,
  confirmation?: string, writeAdditions?: AdditionWriter, content?: PendingParentContent & UpdateOptions, withdrawSourceIds: readonly number[] = []) {
  const { driver } = openDatabaseConnection();
  return driver.transaction(() => {
    const source = resolveSuperMemoBatch(driver, elements, preview, content ?? {});
    if (!source) {
      if (confirmation) throw new Error('supermemo_update_source_changed');
      return undefined;
    }
    const { batchId, key, batch, pairedSourceRequired, reexport, usableEntries } = source;
    const sourceMatch = reexport?.match;
    if (sourceMatch?.status === 'verified' && batch.activeExport !== source.exportHash) sourceMatch.linkOnConfirm = true;
    const blocked = pairedSourceRequired || (sourceMatch && sourceMatch.status !== 'verified');
    const current = { ...batch, entries: usableEntries };
    const plan = blocked ? undefined : planMoves(current, preview, elements, content);
    const changes = plan?.changes ?? [];
    const citations = plan && content ? planBatchCitationUpdates(driver, current, plan, content, elements) : undefined;
    const savedPercent = batch.percent;
    const proposedPercent = content?.updatePercent !== savedPercent ? content?.updatePercent : undefined;
    const firstReviews = plan ? planSuperMemoFirstReviewUpdates(driver, usableEntries, plan.rows, savedPercent, proposedPercent) : undefined;
    const priorities = plan && content?.priorityBoundaries
      ? planSuperMemoPriorityUpdates(driver, batch.entries, usableEntries, plan.rows, content.priorityBoundaries) : undefined;
    const candidates = plan ? planSuperMemoWithdrawals(driver, usableEntries, plan.rows) : [];
    const withdrawals = candidates.map(candidate => candidate.change);
    const signature = createHash('sha256').update(JSON.stringify({ batchId, exportHash: source.exportHash, sourceMatch, pairedSourceRequired, changes, withdrawals,
      proposedPercent, sourceFormat: content?.sourceFormat, citations: citations?.signature, firstReviews: firstReviews?.changes,
      priorityChanges: priorities?.changes,
      firstReviewWrites: firstReviews?.writes.map(({ nodeId, instant, offset, percent }) => [nodeId, instant, offset, percent]),
      moves: plan?.moves.map(({ nodeId, from, to, anchor }) => [nodeId, from, to, anchor]), additions: [...plan?.additions ?? []]
    })).digest('hex');
    if (confirmation && (confirmation !== signature || !plan)) throw new Error('supermemo_update_changed');
    const selected = confirmation ? selectSuperMemoWithdrawals(candidates, withdrawSourceIds) : [];
    const hasOtherWrites = plan && (proposedPercent !== undefined || sourceMatch?.linkOnConfirm || selected.length ||
      plan.moves.length || plan.additions.size || citations?.writes.length || firstReviews?.writes.length);
    if (confirmation && content?.ruleCorrectionsOnly) {
      persistRuleCorrections(driver, key, batch, citations);
    } else if (confirmation && plan && (hasOtherWrites || priorities?.writes.length)) {
      const now = new Date().toISOString();
      if (proposedPercent !== undefined) persistFirstReviewWeight(batch, proposedPercent);
      if (hasOtherWrites) applySuperMemoBatchStructure(batch, plan, now, writeAdditions);
      if (citations?.writes.length && content) {
        applySuperMemoCitationUpdates(driver, batch.entries, citations.writes, now);
        if (citations.changes.some(change => change.status === 'update')) batch.preferredSourceFormat = content.sourceFormat;
      }
      if (firstReviews?.writes.length) applySuperMemoFirstReviewUpdates(driver, firstReviews.writes, now);
      if (priorities?.writes.length) applySuperMemoPriorityUpdates(driver, priorities.writes, now);
      applySuperMemoWithdrawals(selected, now);
      if (preview.pairedCollection) batch.directoryRequiresCollection = true;
      persistSuperMemoExportLink(driver, source, now);
      driver.execute('UPDATE workspace_meta SET value = ?, updated_at = ? WHERE key = ?', [JSON.stringify(batch), now, key]);
    }
    const sourceFormat = batch.preferredSourceFormat ?? batch.sourceFormat;
    return { batchId, signature, pairedSourceRequired, savedPercent,
      ...(proposedPercent !== undefined ? { proposedPercent } : {}), changes, citationChanges: citations?.changes ?? [], textChanges: citations?.textChanges ?? [],
      ...(citations?.writes.some(write => write.title) ? { hasRuleCorrections: true as const } : {}),
      firstReviewChanges: firstReviews?.changes ?? [], priorityChanges: priorities?.changes ?? [], withdrawals, withdrawnSourceIds: selected.map(item => item.change.sourceId),
      ...(sourceFormat ? { sourceFormat } : {}), ...(sourceMatch ? { sourceMatch } : {}),
      imported: batch.imported, skipped: batch.skipped, unresolvedImages: batch.unresolvedImages };
  });
}

export async function confirmSuperMemoDirectoryUpdate(input: ImportInput, signature: string, withdrawSourceIds: readonly number[] = [], ruleCorrectionsOnly?: true) {
  const { elements, preview, collectionDirectory, expectedImages } = input;
  const plan = updateSuperMemoDirectories(elements, preview, undefined, undefined, input);
  if (!plan || plan.signature !== signature || plan.pairedSourceRequired) throw new Error('supermemo_update_changed');
  if (ruleCorrectionsOnly) return updateSuperMemoDirectories(elements, preview, signature, undefined, { ...input, ruleCorrectionsOnly });
  const additions = new Set(plan.changes.filter(change => change.status === 'add').map(change => change.sourceId));
  const prepared = await prepareSuperMemoRows(preview.rows.filter(row => additions.has(row.id)),
    new Map(elements.map(element => [element.id, element])), collectionDirectory, expectedImages);
  return updateSuperMemoDirectories(elements, preview, signature, (_sourceIds, allRows, existingNodeIds, percent, now, rootNodeId) =>
    writeSuperMemoRows(prepared, { ...input, allRows, existingNodeIds, percent, now, rootNodeId,
      existingParentContent: nodeId => loadWorkspaceNodeDocument(openDatabaseConnection().driver, nodeId)?.content
    }), input, withdrawSourceIds);
}
