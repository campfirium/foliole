import type { DbPort } from './dbPort.js';
import { framedSyncFileKey } from './framedSyncFilePort.js';
import type { FramedSyncInventoryDifference } from './framedSyncInventory.js';
import { REQUEST_SYNC_BATCH_BYTES, REQUEST_SYNC_BATCH_OBJECTS, requestSyncBatchEnd,
  type RequestSyncObjectIdentity, type RequestSyncObjectResult } from './requestSyncBatchContract.js';
import { RequestSyncFiles } from './requestSyncFiles.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import { requestSyncObjectMessages, type RequestSyncMessage, type RequestSyncObjectHeader } from './requestSyncObjectMessages.js';
import { writeRequestSyncSnapshot } from './requestSyncSnapshot.js';

export type RequestSyncBatchSelection = RequestSyncObjectIdentity & {
  resolve(db: DbPort): Promise<FramedSyncInventoryDifference>;
};
type PreparedObject = { kind: 'object'; header: RequestSyncObjectHeader; files: RequestSyncFiles }
  | { kind: 'error'; result: RequestSyncObjectResult };

export async function withRequestSyncBatchSnapshot<T>(host: RequestSyncDatabaseHost,
  selections: readonly RequestSyncBatchSelection[], signal: AbortSignal | undefined,
  consume: (objects: readonly PreparedObject[]) => Promise<T>) {
  if (!selections.length || selections.length > REQUEST_SYNC_BATCH_OBJECTS) throw new Error('request_sync_batch_size_invalid');
  const files: RequestSyncFiles[] = [];
  try {
    const prepared = await host.readSnapshot(async db => {
      const objects: PreparedObject[] = [];
      let size = 0;
      for (const selection of selections) {
        signal?.throwIfAborted();
        const scratch = new RequestSyncFiles(host.files, framedSyncFileKey('requests', crypto.randomUUID()), signal);
        files.push(scratch);
        const object = await prepareObject(db, selection, scratch, signal);
        const bytes = object.kind === 'object' ? scratch.byteLength : 0;
        if (object.kind === 'error' || (objects.length && size + bytes > REQUEST_SYNC_BATCH_BYTES)) {
          await scratch.close(); files.pop();
        }
        if (objects.length && size + bytes > REQUEST_SYNC_BATCH_BYTES) break;
        objects.push(object); size += bytes;
        if (size >= REQUEST_SYNC_BATCH_BYTES) break;
      }
      return objects;
    }, signal);
    return await consume(prepared);
  } finally {
    await Promise.all(files.map(file => file.close()));
  }
}

async function prepareObject(db: DbPort, selection: RequestSyncBatchSelection,
  files: RequestSyncFiles, signal?: AbortSignal): Promise<PreparedObject> {
  try {
    const difference = await selection.resolve(db);
    const entry = await writeRequestSyncSnapshot(db, difference, files);
    return { kind: 'object', files, header: { requestId: selection.requestId,
      globalId: entry.globalId, objectType: entry.objectType, sourceStateHash: entry.sharedStateHash } };
  } catch (error) {
    signal?.throwIfAborted();
    return { kind: 'error', result: { requestId: selection.requestId, objectType: selection.objectType,
      globalId: selection.globalId, error: error instanceof Error ? error.message : String(error) } };
  }
}

export async function* requestSyncBatchMessages(objects: readonly PreparedObject[], contextId: Uint8Array,
  requestId: Uint8Array): AsyncGenerator<RequestSyncMessage> {
  for (const object of objects) {
    if (object.kind === 'error') yield { payloadCase: 'request_object_result', payload: object.result };
    else yield* requestSyncObjectMessages(object.header, contextId, object.files);
  }
  yield requestSyncBatchEnd(requestId, objects.length);
}
