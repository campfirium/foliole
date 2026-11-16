import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';
import type { NativeSuperMemoPreview } from '../../lib/platform/nativeSuperMemoImportContract.js';

import type { Batch } from './applySuperMemoBatchStructure.js';
import { superMemoBatchKey } from './superMemoBatchKey.js';
import { matchReexportedSuperMemo, superMemoExportLinkKey } from './superMemoSourceIdentity.js';

export interface SuperMemoUpdateTarget {
  targetBatchId?: string;
  originalElements?: SuperMemoXmlDraftElement[];
}

export function resolveSuperMemoBatch(driver: DatabaseDriver, elements: SuperMemoXmlDraftElement[],
  preview: NativeSuperMemoPreview, target: SuperMemoUpdateTarget) {
  const { batchId: exportHash, key: directKey } = superMemoBatchKey(elements);
  const direct = driver.queryOne<{ value: string }>('SELECT value FROM workspace_meta WHERE key = ?', [directKey]);
  const aliasKey = superMemoExportLinkKey(exportHash);
  const alias = driver.queryOne<{ value: string }>('SELECT value FROM workspace_meta WHERE key = ?', [aliasKey])?.value;
  const foundId = direct ? exportHash : alias;
  if (target.targetBatchId && foundId && target.targetBatchId !== foundId) throw new Error('supermemo_export_already_linked');
  const batchId = target.targetBatchId ?? foundId;
  if (!batchId) return undefined;
  const key = `supermemo-import:${batchId}`;
  const saved = direct ?? driver.queryOne<{ value: string }>('SELECT value FROM workspace_meta WHERE key = ?', [key]);
  if (!saved) throw new Error('supermemo_update_source_changed');
  const batch = JSON.parse(saved.value) as Batch;
  const pairedSourceRequired = !preview.pairedCollection &&
    Boolean(batch.directoryRequiresCollection || batch.entries.some(entry => entry.sourceChildren !== undefined));
  const reexport = batchId === exportHash && (!batch.activeExport || batch.activeExport === exportHash)
    ? undefined : matchReexportedSuperMemo({ batchId, exportHash, entries: batch.entries, elements,
      ...(batch.activeExport ? { activeExport: batch.activeExport } : {}),
      ...(target.originalElements ? { reference: target.originalElements } : {}), alreadyLinked: foundId === batchId });
  const eligible = reexport?.match.status === 'verified';
  if (eligible && reexport) {
    for (const id of reexport.added) batch.entries.push({ id, nodeId: null, outcome: 'skipped' });
  }
  const usableEntries = eligible && reexport
    ? batch.entries.filter(entry => reexport.verified.has(entry.id) || reexport.added.has(entry.id)) : batch.entries;
  return { batch, batchId, key, exportHash, aliasKey, pairedSourceRequired, reexport, usableEntries };
}

export function persistSuperMemoExportLink(driver: DatabaseDriver, source: NonNullable<ReturnType<typeof resolveSuperMemoBatch>>, now: string) {
  const { batch, batchId, reexport, exportHash, aliasKey } = source;
  if (reexport?.match.status !== 'verified') return;
  for (const entry of batch.entries) {
    if (reexport.verified.has(entry.id) || reexport.added.has(entry.id)) entry.sourceEvidence = reexport.after.get(entry.id)!;
    else if (!entry.sourceEvidence && reexport.before.has(entry.id)) entry.sourceEvidence = reexport.before.get(entry.id)!;
  }
  batch.activeExport = exportHash;
  if (exportHash !== batchId) driver.execute(
    'INSERT INTO workspace_meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET updated_at = excluded.updated_at',
    [aliasKey, batchId, now]);
}
