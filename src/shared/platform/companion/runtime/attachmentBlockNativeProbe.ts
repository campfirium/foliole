import { ATTACHMENT_BLOCK_BYTES as BLOCK } from '../../../../../lib/core/sync/attachmentBlockReceiver';
import type { RequestSyncDatabaseHost } from '../../../../../lib/core/sync/requestSyncObjectEndpoint';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';
import { createCompanionAttachmentHost } from '../sync/framed/companionAttachmentBlockFiles';
import { createCompanionFramedSyncFiles } from '../sync/framed/companionFramedSyncFiles';

import { closeCompanionFramedPayloadBudget, companionFramedFileOwner, configureCompanionFramedPayloadBudget } from './companionFramedPayloadBudget';
import { openRequestSnapshotFixture } from './requestSnapshotFixture';

function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

/** Fixed bytes live only in the isolated acceptance app and are removed after the relaunch check. */
export async function runAttachmentBlockNativeProbe(platform: 'android' | 'ios') {
  const fixture = await openRequestSnapshotFixture(platform);
  const owner = fixture.owner;
  const bytes = new Uint8Array(3 * BLOCK + 19).fill(0x79);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  const resource = { storageKey: `${hash}.pdf`, byteLength: bytes.length };
  const createHost = () => {
    const identity = companionFramedFileOwner(owner);
    const db: RequestSyncDatabaseHost = {
      files: createCompanionFramedSyncFiles(FolioleCompanionSync, identity),
      readSnapshot: read => owner.readSnapshot(read), write: write => owner.runWriter(write)
    };
    return createCompanionAttachmentHost(db, identity);
  };
  try {
    const existing = await FolioleCompanionSync.accessFramedSyncFile({ ...companionFramedFileOwner(owner),
      operation: 'attachment', action: 'stat', key: resource.storageKey });
    if (existing.present) {
      requireValue(existing.hash === hash && existing.length === bytes.length, 'Relaunched attachment differs');
      await remove(resource.storageKey);
      return { restoredAfterRelaunch: true, hash, byteLength: bytes.length, cleanup: true };
    }
    const first = await createHost();
    await first.receive(resource, 0, bytes.subarray(0, BLOCK));
    await first.receive(resource, BLOCK, bytes.subarray(BLOCK, 2 * BLOCK));
    await FolioleCompanionSync.accessFramedSyncFile({ ...companionFramedFileOwner(owner),
      operation: 'attachment', action: 'append', key: hash, offset: 2 * BLOCK,
      base64: btoa(String.fromCharCode(...bytes.subarray(2 * BLOCK, 2 * BLOCK + 31))) });
    await closeCompanionFramedPayloadBudget(owner);
    await configureCompanionFramedPayloadBudget(owner);
    const recovered = await createHost();
    const status = await recovered.status(resource);
    requireValue(status.kind === 'partial' && status.offset === BLOCK, 'Partial did not rewind one complete block');
    for (let offset = BLOCK; offset < bytes.length; offset += BLOCK) {
      await recovered.receive(resource, offset, bytes.subarray(offset, offset + BLOCK));
    }
    await recovered.withFile(resource.storageKey, async source => {
      let protectedByLease = false;
      try { await FolioleCompanionSync.maintainAttachmentFiles({ operation: 'move', storageKey: resource.storageKey, trash: true }); }
      catch (error) { protectedByLease = String(error).includes('attachment_send_busy'); }
      requireValue(protectedByLease, 'Collection moved a leased attachment');
      requireValue((await source.read(3 * BLOCK, 19)).every(byte => byte === 0x79), 'Attachment tail differs');
    });
    return { restoredAfterRelaunch: false, hash, byteLength: bytes.length, recoveredOffset: status.offset,
      leaseProtected: true, cleanup: false };
  } finally { await fixture.close(); }
}

async function remove(storageKey: string) {
  await FolioleCompanionSync.maintainAttachmentFiles({ operation: 'move', storageKey, trash: true });
  await FolioleCompanionSync.maintainAttachmentFiles({ operation: 'remove-trash', storageKey });
}
