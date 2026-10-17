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
    await verifyLocalImageImport(companionFramedFileOwner(owner));
    const existing = await FolioleCompanionSync.accessFramedSyncFile({ ...companionFramedFileOwner(owner),
      operation: 'attachment', action: 'stat', key: resource.storageKey });
    if (existing.present) {
      requireValue(existing.hash === hash && existing.length === bytes.length, 'Relaunched attachment differs');
      const lease = await verifySendLease(await createHost(), resource, companionFramedFileOwner(owner));
      await remove(resource.storageKey);
      return { restoredAfterRelaunch: true, hash, byteLength: bytes.length, lease, cleanup: true };
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
    const lease = await verifySendLease(recovered, resource, companionFramedFileOwner(owner));
    return { restoredAfterRelaunch: false, hash, byteLength: bytes.length, recoveredOffset: status.offset,
      leaseProtected: true, lease, cleanup: false };
  } finally { await fixture.close(); }
}

async function verifySendLease(host: Awaited<ReturnType<typeof createCompanionAttachmentHost>>,
  resource: { storageKey: string; byteLength: number }, owner: ReturnType<typeof companionFramedFileOwner>) {
  return host.withFile(resource.storageKey, async source => {
    const presence = await FolioleCompanionSync.accessFramedSyncFile({ ...owner,
      operation: 'attachment', action: 'source-stat', key: resource.storageKey });
    requireValue(presence.present && presence.length === resource.byteLength && presence.hash === '', 'Presence probe read content');
    let rejected = false, errorMessage = '';
    try { await FolioleCompanionSync.maintainAttachmentFiles({ operation: 'move', storageKey: resource.storageKey, trash: true }); }
    catch (error) { rejected = true; errorMessage = String(error); }
    const inventories = await Promise.all([false, true].map(trash =>
      FolioleCompanionSync.maintainAttachmentFiles({ operation: 'inventory', trash })));
    requireValue(inventories.every(value => Array.isArray(value.files)), 'Lease inventory unavailable');
    const [inAssets, inTrash] = inventories.map(value => value.files!.some(file => file.storageKey === resource.storageKey));
    const tailMatches = (await source.read(3 * BLOCK, 19)).every(byte => byte === 0x79);
    const evidence = { rejected, errorMessage, inAssets, inTrash, tailMatches };
    requireValue(rejected && inAssets && !inTrash && tailMatches, `Lease protection failed: ${JSON.stringify(evidence)}`);
    requireValue(errorMessage.includes('attachment_send_busy'), `Lease rejection reason hidden: ${JSON.stringify(evidence)}`);
    return evidence;
  });
}

async function remove(storageKey: string) {
  await FolioleCompanionSync.maintainAttachmentFiles({ operation: 'move', storageKey, trash: true });
  await FolioleCompanionSync.maintainAttachmentFiles({ operation: 'remove-trash', storageKey });
}

async function verifyLocalImageImport(owner: ReturnType<typeof companionFramedFileOwner>) {
  const bytesBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=';
  const bytes = Uint8Array.from(atob(bytesBase64), value => value.charCodeAt(0));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const contentHash = [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const storageKey = `${contentHash}.png`;
  const request = { bytesBase64, contentHash, storageKey, mimeType: 'image/png' };
  await FolioleCompanionSync.writeImageAttachment(request);
  requireValue((await FolioleCompanionSync.writeImageAttachment(request)).storedFile === 'reused', 'Imported image was not reused');
  const info = await FolioleCompanionSync.accessFramedSyncFile({ ...owner,
    operation: 'attachment', action: 'stat', key: storageKey });
  requireValue(info.present && info.hash === contentHash && info.length === bytes.length, 'Imported image differs');
  await remove(storageKey);
}
