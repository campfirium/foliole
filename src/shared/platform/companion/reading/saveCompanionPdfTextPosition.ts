import { computeSyncContentHash } from '../../../../../lib/core/database/syncState';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { READ_READING_RESUME_SQL, WRITE_READING_RESUME_SQL } from '../../../../../lib/core/sync/readingResumeApply';
import { advanceReadingResume, parseReadingResumeState } from '../../../../../lib/core/sync/readingResumeState';
import { decodePdfReadingPosition, encodePdfReadingPosition, pdfReadingContentHash } from '../../../../../lib/platform/pdfReadingPosition';
import { iosCompanionDeviceId, markIosCompanionMutation } from '../runtime/iosCompanionMutationState';

import type { CompanionPdfReadingContext } from './companionPdfTextResume';

export type CompanionPdfPageUpdate = { nodeId: string; context: CompanionPdfReadingContext; page: number; textOffset: number };

export async function writeCompanionPdfTextPosition(tx: DbPort, nodeId: string, update: CompanionPdfPageUpdate,
  hostName: string, updatedAt: string) {
  if (nodeId !== update.nodeId) return null;
  const { context, page } = update;
  const [node] = await tx.query<{ current_version_id: string | null }>(
    `SELECT n.current_version_id FROM nodes n, json_each(n.resource_references) r
     WHERE n.id = ? AND n.deleted_at IS NULL AND json_extract(r.value, '$.role') = 'reference'
       AND json_extract(r.value, '$.storage_key') = ?`, [nodeId, `${context.attachmentId}.pdf`]);
  const [epoch] = await tx.query<{ source_epoch: string }>('SELECT source_epoch FROM sync_state_sequence WHERE singleton_id = 1');
  if (!node || node.current_version_id !== context.versionId || epoch?.source_epoch !== context.epoch) return null;
  const [member] = await tx.query<{ local_device_identity_key: string }>(
    "SELECT local_device_identity_key FROM sync_group_local_state WHERE singleton_id = 1 AND state = 'active'");
  const device = member?.local_device_identity_key ?? await iosCompanionDeviceId(tx);
  const actor = JSON.stringify([device, context.epoch]);
  const [record] = await tx.query<{ payload_json: string }>(READ_READING_RESUME_SQL, [nodeId]);
  const state = record ? parseReadingResumeState(record.payload_json) : null;
  const contentHash = pdfReadingContentHash(context.attachmentId);
  const own = state?.positions.find(([hash, value]) =>
    hash === contentHash && value.actor === actor && (value.clock[actor] ?? 0) > (context.clock[actor] ?? 0))?.[1];
  const previous = own?.offset ?? context.offset;
  if (previous !== null && decodePdfReadingPosition(previous).page === page) return null;
  const next = advanceReadingResume(state, contentHash, actor, encodePdfReadingPosition(page, 0), context.clock);
  await tx.run(WRITE_READING_RESUME_SQL, [nodeId, JSON.stringify(next)]);
  await markIosCompanionMutation({ db: tx, objectId: nodeId, objectType: 'node_reading_resume',
    contentHash: computeSyncContentHash('node_reading_resume', next),
    hostName, updatedAt });
}
