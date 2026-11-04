import { bytesToHex } from '@noble/hashes/utils.js';

import type { AttachmentBlockSource, AttachmentBlockDestination } from '../attachmentBlockTransfer.js';
import { transferAttachmentBlocks } from '../attachmentBlockTransfer.js';
import type { FramedSyncFilePort } from '../framedSyncFilePort.js';
import { frameTypeForPayload } from '../framedSyncReceiver.js';

import { loadFolderSyncCheckpoint, publishFolderSyncCheckpoint, readFolderSyncInventory,
  readFolderSyncMessage, storeFolderSyncInventory, storeFolderSyncEncodedMessage, type FolderSyncCheckpoint } from './checkpoint.js';
import { captureFolderSyncSource, type FolderSyncSourceHost } from './sourceSnapshot.js';

export type FolderSyncWriteTarget = {
  /** exclusive() must cover every writer for this target, not merely one source library. */
  files: FramedSyncFilePort;
  attachments: AttachmentBlockDestination;
};

export async function writeFolderSyncRound(input: {
  sourceId: string;
  source: FolderSyncSourceHost;
  sourceAttachments: AttachmentBlockSource;
  target: FolderSyncWriteTarget;
  assertCurrent(): void;
  signal?: AbortSignal;
}) {
  const check = () => { input.signal?.throwIfAborted(); input.assertCurrent(); };
  return input.target.files.exclusive('folder-sync-owner', async () => {
    check();
    const previous = await loadFolderSyncCheckpoint(input.target.files, input.sourceId);
    // A cached index is not proof that its referenced protocol messages are still present.
    for (const object of previous?.objects ?? []) {
      for (const frame of object.frames) await readFolderSyncMessage(input.target.files, frame);
    }
    const inventory = previous ? await readFolderSyncInventory(input.target.files, previous) : [];
    const snapshot = await captureFolderSyncSource({ host: input.source, previous: inventory,
      ...(input.signal ? { signal: input.signal } : {}) });
    try {
      const objects = [...previous?.objects ?? []];
      let bytesWritten = 0;
      for (const object of snapshot.objects) {
        const frames = [];
        for await (const { message, encoded } of snapshot.messages(object)) {
          const stored = await storeFolderSyncEncodedMessage(input.target.files, encoded, frameTypeForPayload(message.payloadCase), check);
          frames.push(stored.frame);
          bytesWritten += stored.bytesWritten;
        }
        objects.push({ objectType: object.objectType, globalId: object.globalId,
          contextId: bytesToHex(snapshot.contextId), frames });
      }
      const resources = await writeResources(input, snapshot.resourceKeys, previous, check);
      const changed = !previous || snapshot.objects.length > 0 || resources.transferred > 0 ||
        JSON.stringify(resources.pending) !== JSON.stringify(previous.pendingResources);
      if (changed) {
        const stored = await storeFolderSyncInventory(input.target.files, snapshot.inventory, check);
        bytesWritten += stored.bytesWritten;
        const checkpoint: FolderSyncCheckpoint = { format: 1, sourceId: input.sourceId,
          generation: (previous?.generation ?? 0) + 1, inventory: stored.frames, objects,
          resources: resources.known, pendingResources: resources.pending };
        bytesWritten += await publishFolderSyncCheckpoint(input.target.files, checkpoint, check);
      }
      check();
      return { changed, databaseComplete: true, changedObjects: snapshot.objects.length,
        transferredResources: resources.transferred, pendingResources: resources.pending,
        protocolBytesWritten: bytesWritten, generation: (previous?.generation ?? 0) + Number(changed) };
    } finally { await snapshot.dispose(); }
  });
}

async function writeResources(input: Parameters<typeof writeFolderSyncRound>[0], keys: string[],
  previous: FolderSyncCheckpoint | null, check: () => void) {
  const known = new Map(previous?.resources.map(resource => [resource.storageKey, resource]) ?? []);
  const pending: string[] = [];
  let transferred = 0;
  for (const storageKey of keys) {
    check();
    try {
      const old = known.get(storageKey);
      if (old && (await input.target.attachments.status(old)).kind === 'complete') continue;
      const resource = await transferAttachmentBlocks({ storageKey, source: input.sourceAttachments,
        destination: input.target.attachments, ...(input.signal ? { signal: input.signal } : {}) });
      known.set(storageKey, resource);
      transferred++;
    } catch {
      check();
      // Match ordinary sync: database facts commit independently; unavailable resources remain pending.
      pending.push(storageKey);
    }
  }
  return { known: [...known.values()], pending, transferred };
}
