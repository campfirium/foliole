import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';

import type { CanonicalFact } from './framedSyncCanonicalManifest.js';
import type { FramedSyncContext, TransferReceiptStage } from './framedSyncContract.js';
import { readFramedSyncFileInbound } from './framedSyncFileInboundRecord.js';
import { decodeFramedSyncFileJson, encodeFramedSyncFileJson, type FramedSyncFilePort } from './framedSyncFilePort.js';
import { framedFileDigest } from './framedSyncFileSchemas.js';
import { framedSyncReceiptMatches } from './framedSyncOutboundReceiptStaging.js';
import type { FramedSyncResourceDemandKey } from './framedSyncResourceDemands.js';
import { restoreFramedSyncResourceFact } from './framedSyncResourceFact.js';

const demandSchema = z.object({
  key: z.object({ groupId: z.string(), receiverDeviceId: z.string(), receiverLibraryEpoch: z.string(),
    globalId: z.string(), versionId: z.string(), bodyHash: z.string(), storageKey: z.string() }),
  demandId: z.string().min(1), state: z.enum(['pending', 'verified_present', 'no_longer_required']),
  requestStarted: z.boolean(), sharedStateHash: framedFileDigest.optional(), transferId: framedFileDigest.optional()
});

function keyBytes(key: FramedSyncResourceDemandKey) {
  return encodeFramedSyncFileJson([key.groupId, key.receiverDeviceId, key.receiverLibraryEpoch,
    key.globalId, key.versionId, key.bodyHash, key.storageKey]);
}

function demandPath(key: FramedSyncResourceDemandKey) {
  return `${demandDirectory(key)}/${bytesToHex(sha256(keyBytes(key)))}.json`;
}

type DemandScope = Pick<FramedSyncResourceDemandKey, 'groupId' | 'receiverDeviceId' | 'receiverLibraryEpoch' | 'globalId'>;

function demandDirectory(scope: DemandScope) {
  return `demands/${bytesToHex(sha256(encodeFramedSyncFileJson([
    scope.groupId, scope.receiverDeviceId, scope.receiverLibraryEpoch, scope.globalId
  ])))}`;
}

export async function listFramedSyncFileResourceDemands(files: FramedSyncFilePort, scope: DemandScope) {
  const directory = demandDirectory(scope);
  const rows: z.infer<typeof demandSchema>[] = [];
  for (const name of await files.list(directory)) {
    if (!/^[a-f0-9]{64}\.json$/u.test(name)) throw new Error('framed_sync_resource_demand_file_invalid');
    const data = await files.read(`${directory}/${name}`);
    if (!data) continue;
    const row = demandSchema.parse(decodeFramedSyncFileJson(data));
    if (demandPath(row.key) !== `${directory}/${name}`) throw new Error('framed_sync_resource_demand_mismatch');
    rows.push(row);
  }
  return rows;
}

export async function readFramedSyncFileResourceDemand(files: FramedSyncFilePort, key: FramedSyncResourceDemandKey) {
  const data = await files.read(demandPath(key));
  if (!data) return null;
  const row = demandSchema.parse(decodeFramedSyncFileJson(data));
  if (bytesToHex(keyBytes(row.key)) !== bytesToHex(keyBytes(key))) throw new Error('framed_sync_resource_demand_mismatch');
  return row;
}

export async function ensureFramedSyncFileResourceDemand(files: FramedSyncFilePort,
  key: FramedSyncResourceDemandKey, createId: () => string) {
  return files.exclusive(demandPath(key), async () => {
    const row = await readFramedSyncFileResourceDemand(files, key);
    if (row?.state === 'pending') return row.demandId;
    const demandId = createId();
    if (!demandId) throw new Error('framed_sync_resource_demand_id_invalid');
    await files.write(demandPath(key), encodeFramedSyncFileJson({ key, demandId, state: 'pending', requestStarted: false }));
    return demandId;
  });
}

export async function startFramedSyncFileResourceDemand(files: FramedSyncFilePort,
  key: FramedSyncResourceDemandKey, demandId: string, sharedStateHash: Uint8Array) {
  if (sharedStateHash.byteLength !== 32) throw new Error('framed_sync_resource_request_hash_invalid');
  await files.exclusive(demandPath(key), async () => {
    const row = await readFramedSyncFileResourceDemand(files, key);
    if (!row || row.state !== 'pending' || row.demandId !== demandId ||
        (row.requestStarted && (!row.sharedStateHash || bytesToHex(row.sharedStateHash) !== bytesToHex(sharedStateHash)))) {
      throw new Error('framed_sync_resource_demand_not_pending');
    }
    await files.write(demandPath(key), encodeFramedSyncFileJson({ ...row, requestStarted: true, sharedStateHash }));
  });
}

export async function validateFramedSyncFileResourceDemand(files: FramedSyncFilePort,
  context: FramedSyncContext, fact: CanonicalFact, transferId: Uint8Array) {
  const binding = restoreFramedSyncResourceFact(fact);
  const key: FramedSyncResourceDemandKey = { groupId: context.groupId, receiverDeviceId: context.receiverDeviceId,
    receiverLibraryEpoch: context.receiverLibraryEpoch, globalId: binding.globalId,
    versionId: binding.versionId, bodyHash: binding.bodyHash, storageKey: binding.resource.storageKey };
  const row = await readFramedSyncFileResourceDemand(files, key);
  if (!row || row.demandId !== binding.demandId || row.state === 'no_longer_required') {
    throw new Error('framed_sync_resource_demand_mismatch');
  }
  if (row.sharedStateHash && bytesToHex(row.sharedStateHash) !== bytesToHex(fact.sharedStateHash)) {
    throw new Error('framed_sync_resource_demand_hash_mismatch');
  }
  if (row.state === 'verified_present' && (!row.transferId || bytesToHex(row.transferId) !== bytesToHex(transferId))) {
    throw new Error('framed_sync_resource_demand_already_completed');
  }
  return row;
}

/** Business resource availability has committed before the file receipt and this completion. */
export async function completeFramedSyncFileResourceDemand(files: FramedSyncFilePort,
  context: FramedSyncContext, fact: CanonicalFact, receipt: TransferReceiptStage) {
  const saved = (await readFramedSyncFileInbound(files, receipt.transferId))?.receipt;
  if (!saved || !framedSyncReceiptMatches(saved, receipt)) {
    throw new Error('framed_sync_resource_demand_receipt_missing');
  }
  const validated = await validateFramedSyncFileResourceDemand(files, context, fact, receipt.transferId);
  await files.exclusive(demandPath(validated.key), async () => {
    const row = await validateFramedSyncFileResourceDemand(files, context, fact, receipt.transferId);
    if (receipt.receiverDeviceId !== context.receiverDeviceId || receipt.receiverLibraryEpoch !== context.receiverLibraryEpoch ||
        bytesToHex(receipt.contentId) !== bytesToHex(receipt.appliedStateHash)) throw new Error('framed_sync_resource_demand_receipt_missing');
    await files.write(demandPath(row.key), encodeFramedSyncFileJson({ ...row,
      state: 'verified_present', transferId: receipt.transferId }));
  });
}

export async function obsoleteFramedSyncFileResourceDemand(files: FramedSyncFilePort,
  key: FramedSyncResourceDemandKey, demandId: string) {
  await files.exclusive(demandPath(key), async () => {
    const row = await readFramedSyncFileResourceDemand(files, key);
    if (row?.demandId === demandId && row.state === 'pending' && !row.requestStarted) {
      await files.write(demandPath(key), encodeFramedSyncFileJson({ ...row, state: 'no_longer_required' }));
    }
  });
}
