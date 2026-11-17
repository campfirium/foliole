import type { SuperMemoSourceFormat } from '../../lib/core/import/superMemoSourceFormatting.js';
import type { NativeSuperMemoPreview } from '../../lib/platform/nativeSuperMemoImportContract.js';

import { applySuperMemoDirectoryMoves, type SuperMemoDirectoryMove } from './applySuperMemoDirectoryMoves.js';
import type { SuperMemoContentBatchEntry } from './planSuperMemoCitationUpdates.js';
import type { SuperMemoFirstReviewReceipt } from './planSuperMemoFirstReviewUpdates.js';
import type { writeSuperMemoRows } from './runSuperMemoImport.js';
import type { SuperMemoSourceEvidence } from './superMemoSourceIdentity.js';

export interface BatchEntry extends SuperMemoContentBatchEntry, Omit<SuperMemoFirstReviewReceipt, 'outcome'> {
  withdrawnAt?: string;
  sourceEvidence?: SuperMemoSourceEvidence;
  sourceChildren?: number[];
  unresolvedImages?: unknown[];
}
export interface Batch {
  entries: BatchEntry[];
  activeExport?: string;
  rootNodeId?: string;
  directoryRequiresCollection?: boolean;
  sourceFormat?: SuperMemoSourceFormat;
  preferredSourceFormat?: SuperMemoSourceFormat;
  imported: number;
  skipped: number;
  percent: number;
  unresolvedImages: number;
}

export type AdditionWriter = (sourceIds: number[], rows: NativeSuperMemoPreview['rows'],
  existingNodeIds: ReadonlyMap<number, string>, percent: number, now: string, rootNodeId?: string) => ReturnType<typeof writeSuperMemoRows>;

export function applySuperMemoBatchStructure(batch: Batch, plan: {
  additions: ReadonlyMap<number, { pendingId: string }>; moves: (SuperMemoDirectoryMove & { entry: BatchEntry })[];
  rows: NativeSuperMemoPreview['rows']; existingNodeIds: ReadonlyMap<number, string>;
}, now: string, writeAdditions?: AdditionWriter) {
  const { additions, moves, rows, existingNodeIds } = plan;
  if (additions.size && !writeAdditions) throw new Error('supermemo_update_additions_not_prepared');
  const created = additions.size ? writeAdditions!([...additions.keys()], rows, existingNodeIds, batch.percent, now, batch.rootNodeId) : [];
  const bySource = new Map(created.map(entry => [entry.id, entry]));
  const replacements = new Map<string, string>();
  for (const [sourceId, { pendingId }] of additions) {
    const id = bySource.get(sourceId)?.nodeId;
    if (!id) throw new Error('supermemo_update_addition_missing');
    replacements.set(pendingId, id);
  }
  const resolvedMoves = moves.map(move => ({ ...move, to: move.to === null ? null : replacements.get(move.to) ?? move.to }));
  if (resolvedMoves.length) applySuperMemoDirectoryMoves(resolvedMoves, now, new Set(replacements.values()));
  for (const move of resolvedMoves) {
    move.entry.importedParentNodeId = move.to;
    if (move.anchor) move.entry.importedAnchorLink = JSON.stringify(move.anchor.link);
  }
  batch.entries = batch.entries.map(entry => bySource.get(entry.id) ?? entry);
  batch.imported = batch.entries.filter(entry => entry.nodeId).length;
  batch.skipped = batch.entries.length - batch.imported;
  batch.unresolvedImages = batch.entries.reduce((total, entry) => total + (entry.unresolvedImages?.length ?? 0), 0);
}
