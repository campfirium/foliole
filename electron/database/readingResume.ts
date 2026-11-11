import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { loadStandaloneDeviceUuid } from '../../lib/core/database/standaloneDeviceIdentity.js';
import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { READ_READING_RESUME_SQL, WRITE_READING_RESUME_SQL } from '../../lib/core/sync/readingResumeApply.js';
import {
  advanceReadingResume,
  parseReadingResumeState,
  readReadingResumeClock,
  readReadingResumeOffset
} from '../../lib/core/sync/readingResumeState.js';
import type { NativeReadingResumeContext } from '../../lib/platform/nativeReadingProgressContract.js';
import { encodePdfReadingPosition, pdfReadingContentHash, PDF_READING_POSITION_PRECISION } from '../../lib/platform/pdfReadingPosition.js';

export function pdfResumeOffset(state: { selectionFrom: number | null; scrollTop: number }) {
  if (state.selectionFrom === null || state.selectionFrom < 1 ||
      state.scrollTop < 0 || state.scrollTop > PDF_READING_POSITION_PRECISION) return undefined;
  const offset = encodePdfReadingPosition(state.selectionFrom, state.scrollTop / PDF_READING_POSITION_PRECISION);
  return Number.isSafeInteger(offset) ? offset : undefined;
}

function readResumeState(driver: DatabaseDriver, nodeId: string) {
  const row = driver.queryOne<{ payload_json: string }>(READ_READING_RESUME_SQL, [nodeId]);
  return row ? parseReadingResumeState(row.payload_json) : null;
}

function readContentHash(driver: DatabaseDriver, nodeId: string, pdfAttachmentId?: string) {
  if (!pdfAttachmentId) return driver.queryOne<{ body_blob_hash: string | null }>(
    'SELECT body_blob_hash FROM nodes WHERE id = ? AND deleted_at IS NULL', [nodeId])?.body_blob_hash;
  return driver.queryOne<{ id: string }>(
    `SELECT node.id FROM nodes node, json_each(node.resource_references) resource
      WHERE node.id = ? AND node.deleted_at IS NULL
        AND json_extract(resource.value, '$.role') = 'reference'
        AND json_extract(resource.value, '$.storage_key') = ?`,
    [nodeId, `${pdfAttachmentId}.pdf`]
  ) ? pdfReadingContentHash(pdfAttachmentId) : null;
}

function readLibraryEpoch(driver: DatabaseDriver) {
  return driver.queryOne<{ source_epoch: string }>(
    'SELECT source_epoch FROM sync_state_sequence WHERE singleton_id = 1')?.source_epoch;
}

export function loadDesktopReadingResume(driver: DatabaseDriver, nodeId: string, pdfAttachmentId?: string): NativeReadingResumeContext | null {
  const contentHash = readContentHash(driver, nodeId, pdfAttachmentId);
  const libraryEpoch = readLibraryEpoch(driver);
  if (!contentHash || !libraryEpoch) return null;
  const state = readResumeState(driver, nodeId);
  return { nodeId, contentHash, libraryEpoch, clock: readReadingResumeClock(state),
    ...(pdfAttachmentId ? { pdfAttachmentId } : {}),
    offset: readReadingResumeOffset(state, contentHash) ?? null };
}

export function saveDesktopReadingResume(
  driver: DatabaseDriver,
  input: { offset: number; context: NativeReadingResumeContext; hostName: string; updatedAt: string }
) {
  const { context, offset } = input;
  if (readContentHash(driver, context.nodeId, context.pdfAttachmentId) !== context.contentHash) return;
  const device = driver.queryOne<{ local_device_identity_key: string }>(
    "SELECT local_device_identity_key FROM sync_group_local_state WHERE singleton_id = 1 AND state = 'active'"
  )?.local_device_identity_key ?? loadStandaloneDeviceUuid(driver);
  const epoch = readLibraryEpoch(driver);
  if (!device || epoch !== context.libraryEpoch) return;
  const actor = JSON.stringify([device, epoch]);
  const state = readResumeState(driver, context.nodeId);
  const own = state?.positions.find(([content, value]) => content === context.contentHash &&
    value.actor === actor && value.clock[actor]! > (context.clock[actor] ?? 0))?.[1];
  if ((own?.offset ?? context.offset) === offset) return;
  const next = advanceReadingResume(state, context.contentHash, actor, offset, context.clock);
  driver.execute(WRITE_READING_RESUME_SQL, [context.nodeId, JSON.stringify(next)]);
  upsertSyncObjectState(driver, {
    objectType: 'node_reading_resume', objectId: context.nodeId,
    contentHash: computeSyncContentHash('node_reading_resume', next),
    lastModifiedByHostName: input.hostName, updatedAt: input.updatedAt, syncDirty: true
  });
}
