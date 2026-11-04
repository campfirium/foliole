import { bytesToHex } from '@noble/hashes/utils.js';

import { loadArticleAttachmentNeeds } from '../articleAttachmentNeeds.js';
import { flushCurrentParentOrderProjectionsWithDbPort } from '../currentParentOrderStore.js';
import type { DbPort } from '../dbPort.js';
import { compareFramedSyncDatabaseInventories } from '../framedSyncDatabaseDifference.js';
import { framedSyncFileKey } from '../framedSyncFilePort.js';
import type { FramedSyncInventoryDifference, FramedSyncInventoryEntry } from '../framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../framedSyncInventoryRead.js';
import { decodeAndValidateProtocolMessage } from '../framedSyncProtocolCodec.js';
import { frameTypeForPayload } from '../framedSyncReceiver.js';
import { withRequestSyncFiles } from '../requestSyncFiles.js';
import type { RequestSyncDatabaseHost } from '../requestSyncObjectEndpoint.js';
import { encodeRequestSyncMessage, requestSyncObjectMessages } from '../requestSyncObjectMessages.js';
import type { RequestSyncDecodedMessage } from '../requestSyncObjectReceiver.js';
import { writeRequestSyncSnapshot } from '../requestSyncSnapshot.js';
import { assertSyncGroupLocalPublicationAllowed } from '../syncGroupLocalAdoption.js';

export type FolderSyncSourceHost = Pick<RequestSyncDatabaseHost, 'files' | 'readSnapshot' | 'write'>;
export type FolderSyncStagedFrame = { key: string; type: number };
export type FolderSyncStagedObject = { objectType: string; globalId: string; frames: FolderSyncStagedFrame[] };
export type FolderSyncSourceSnapshot = {
  contextId: Uint8Array;
  inventory: FramedSyncInventoryEntry[];
  objects: FolderSyncStagedObject[];
  resourceKeys: string[];
  messages(object: FolderSyncStagedObject): AsyncGenerator<RequestSyncDecodedMessage>;
  dispose(): Promise<void>;
};

/** Stages one coherent source snapshot locally, before any destination I/O. No peer credentials are used. */
export async function captureFolderSyncSource(input: {
  host: FolderSyncSourceHost;
  previous: readonly FramedSyncInventoryEntry[];
  signal?: AbortSignal;
}): Promise<FolderSyncSourceSnapshot> {
  const contextId = crypto.getRandomValues(new Uint8Array(32));
  const directory = framedSyncFileKey('folder-sync', bytesToHex(contextId));
  const dispose = () => input.host.files.remove(directory);
  try {
    input.signal?.throwIfAborted();
    await input.host.write(flushCurrentParentOrderProjectionsWithDbPort);
    const captured = await input.host.readSnapshot(async db => {
      // A publication block is not an empty source library.
      await assertSyncGroupLocalPublicationAllowed(db);
      const inventory = await readRequestSyncInventorySnapshot(db);
      if (inventory.some(entry => entry.unready)) throw new Error('folder_sync_source_not_ready');
      const differences = compareFramedSyncDatabaseInventories({ local: inventory, remote: input.previous })
        .filter(difference => difference.direction === 'local_to_remote');
      const needs = await loadArticleAttachmentNeeds(db,
        inventory.filter(entry => entry.objectType === 'node').map(entry => entry.globalId));
      if (needs.unreadableArticleIds.length) throw new Error('folder_sync_source_body_unavailable');
      const objects: FolderSyncStagedObject[] = [];
      for (const difference of differences) {
        input.signal?.throwIfAborted();
        objects.push(await stageObject(input.host, db, difference, contextId, directory, objects.length, input.signal));
      }
      return { inventory, objects, resourceKeys: needs.needs.map(need => need.storageKey).sort() };
    }, input.signal);
    input.signal?.throwIfAborted();
    return { ...captured, contextId, dispose, async *messages(object) {
      for (const frame of object.frames) {
        input.signal?.throwIfAborted();
        const encoded = await input.host.files.read(frame.key);
        if (!encoded) throw new Error('folder_sync_staged_frame_missing');
        yield { encoded, message: decodeAndValidateProtocolMessage(encoded, frame.type) };
      }
    } };
  } catch (error) {
    await dispose();
    throw error;
  }
}

async function stageObject(host: FolderSyncSourceHost, db: DbPort, difference: FramedSyncInventoryDifference,
  contextId: Uint8Array, directory: string, ordinal: number, signal?: AbortSignal): Promise<FolderSyncStagedObject> {
  return withRequestSyncFiles(host.files, async request => {
    const entry = await writeRequestSyncSnapshot(db, difference, request);
    const header = { requestId: crypto.getRandomValues(new Uint8Array(16)), objectType: entry.objectType,
      globalId: entry.globalId, currentVersionId: entry.currentVersionId ?? '', sourceStateHash: entry.sharedStateHash };
    const frames: FolderSyncStagedFrame[] = [];
    for await (const message of requestSyncObjectMessages(header, contextId, request)) {
      signal?.throwIfAborted();
      const key = framedSyncFileKey(...directory.split('/'), `object-${ordinal}-frame-${frames.length}`);
      await host.files.write(key, encodeRequestSyncMessage(message));
      frames.push({ key, type: frameTypeForPayload(message.payloadCase) });
    }
    return { objectType: entry.objectType, globalId: entry.globalId, frames };
  }, signal);
}
