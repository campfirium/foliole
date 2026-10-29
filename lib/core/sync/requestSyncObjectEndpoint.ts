import type { SyncGroupMemberStatePayload } from '../../platform/syncGroupMemberStateContract.js';
import type { WorkspaceRefreshScope } from '../database/workspaceSnapshotRefresh.js';

import type { DbPort } from './dbPort.js';
import { FRAMED_SYNC_PROTOCOL_VERSION, type FramedSyncContext } from './framedSyncContract.js';
import { decodeFramedSyncPreamble } from './framedSyncFraming.js';
import type { FramedSyncInventoryDifference, FramedSyncInventoryNeed } from './framedSyncInventory.js';
import { withRequestSyncFiles, type RequestSyncFilePort } from './requestSyncFiles.js';
import { applyRequestSyncObject, type RequestSyncObjectInput } from './requestSyncObjectApply.js';
import { assertRequestSyncObjectSource, requestSyncObjectMessages, type RequestSyncObjectHeader } from './requestSyncObjectMessages.js';
import { receiveRequestSyncObjectMessages } from './requestSyncObjectReceiver.js';
import { assertReceivedRequestFacts } from './requestSyncReceivedSelection.js';
import { writeRequestSyncSnapshot } from './requestSyncSnapshot.js';
import { prepareRequestSyncWire, readRequestSyncWire,
  type RequestSyncAuthenticatedContext, type RequestSyncWireFrame } from './requestSyncWire.js';
import type { DeferredVisibilityPruning } from './syncNodeVisibilityPruning.js';
import type { ApplySyncObjectsWithDbPortOptions } from './syncObjectApplyExecutor.js';

export interface RequestSyncDatabaseHost {
  files: RequestSyncFilePort;
  enqueueSearchInvalidations?: boolean;
  objectOptions?(db: DbPort): Promise<ApplySyncObjectsWithDbPortOptions>;
  objectApplied?(object: { objectType: string; globalId: string; workspaceScope: WorkspaceRefreshScope }): void | Promise<void>;
  refreshNodeIndex?(db: DbPort, scope: WorkspaceRefreshScope): Promise<void>;
  readSnapshot<T>(read: (db: DbPort) => Promise<T>, signal?: AbortSignal): Promise<T>;
  write<T>(write: (db: DbPort) => Promise<T>): Promise<T>;
}

export async function sendRequestSyncObject<T>(host: RequestSyncDatabaseHost, input: {
  context: RequestSyncAuthenticatedContext;
  difference: FramedSyncInventoryDifference;
  groupKey: Uint8Array;
  signal?: AbortSignal;
}, send: (stream: Awaited<ReturnType<typeof prepareRequestSyncWire>> & { requestId: Uint8Array }) => Promise<T>) {
  return withRequestSyncFiles(host.files, async files => {
    const entry = await host.readSnapshot(db => writeRequestSyncSnapshot(db, input.difference, files), input.signal);
    const header = { requestId: crypto.getRandomValues(new Uint8Array(16)),
      globalId: entry.globalId, objectType: entry.objectType, currentVersionId: entry.currentVersionId ?? '', sourceStateHash: entry.sharedStateHash };
    const stream = await prepareRequestSyncWire({ context: input.context, groupKey: input.groupKey,
       ...(input.signal ? { signal: input.signal } : {}),
      messages: contextId => requestSyncObjectMessages(header, contextId, files) });
    try { return await send({ ...stream, requestId: header.requestId }); }
    finally {
      await stream.frames.return(undefined);
    }
  }, input.signal);
}

export async function receiveRequestSyncObject(host: RequestSyncDatabaseHost, input: {
  context: RequestSyncAuthenticatedContext;
  author: 'initiator' | 'responder';
  groupKey: Uint8Array;
  peerState: SyncGroupMemberStatePayload;
  preamble: Uint8Array;
  frames: AsyncIterable<RequestSyncWireFrame>;
  expectedObject: { objectType: string; globalId: string; sourceSnapshot?: FramedSyncInventoryDifference['sourceSnapshot']; need?: FramedSyncInventoryNeed };
  signal?: AbortSignal;
  objectOptions?: ApplySyncObjectsWithDbPortOptions;
}) {
  return withRequestSyncFiles(host.files, async files => {
    const contextId = decodeFramedSyncPreamble(input.preamble).contextId;
    const header = await receiveRequestSyncObjectMessages(readRequestSyncWire(input), contextId, files);
    if (header.globalId !== input.expectedObject.globalId || header.objectType !== input.expectedObject.objectType) {
      throw new Error('request_sync_object_identity_mismatch');
    }
    assertRequestSyncObjectSource(header, input.expectedObject.sourceSnapshot);
    if (input.expectedObject.need) await assertReceivedRequestFacts(files, input.expectedObject.need);
    return applyReceivedRequestSyncObject(host, input, header, files);
  }, input.signal);
}

export async function applyReceivedRequestSyncObject(host: RequestSyncDatabaseHost,
  input: Pick<Parameters<typeof receiveRequestSyncObject>[1], 'context' | 'author' | 'peerState' | 'signal' | 'objectOptions'>,
  header: RequestSyncObjectHeader, files: import('./requestSyncFiles.js').RequestSyncFiles) {
  input.signal?.throwIfAborted();
  const result = await host.write(async db => {
    const applied = await applyRequestSyncObject(db, receivedObjectInput(host, input, header, files,
      { ...await host.objectOptions?.(db), ...input.objectOptions }));
    await host.refreshNodeIndex?.(db, applied.workspaceScope);
    return applied;
  });
  await host.objectApplied?.({ ...header, workspaceScope: result.workspaceScope });
  return { ...result, requestId: header.requestId };
}

export function receivedObjectInput(host: RequestSyncDatabaseHost,
  input: Pick<Parameters<typeof receiveRequestSyncObject>[1], 'context' | 'author' | 'peerState' | 'signal'>,
  header: RequestSyncObjectHeader, files: import('./requestSyncFiles.js').RequestSyncFiles,
  objectOptions: ApplySyncObjectsWithDbPortOptions, visibilityPruning?: DeferredVisibilityPruning): RequestSyncObjectInput {
  return {
    ...(files.dailyFlow.complete ? { dailyFlow: files.dailyFlow } : {}),
    context: objectContext(input.context, input.author), globalId: header.globalId, objectType: header.objectType,
    ...(header.currentVersionId ? { currentVersionId: header.currentVersionId } : {}),
    sourceStateHash: header.sourceStateHash, requestId: header.requestId, peerState: input.peerState,
    facts: async function* (_db, kinds) { yield* files.readFacts(kinds); }, loadBody: (_db, blob) => files.loadBody(blob),
    enqueueSearchInvalidations: host.enqueueSearchInvalidations ?? true,
    ...(input.signal ? { signal: input.signal } : {}),
    ...(visibilityPruning ? { visibilityPruning } : {}),
    objectOptions
  };
}

function objectContext(context: RequestSyncAuthenticatedContext, author: 'initiator' | 'responder'): FramedSyncContext {
  return { groupId: context.groupId, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    senderDeviceId: author === 'initiator' ? context.initiatorDeviceId : context.responderDeviceId,
    senderLibraryEpoch: author === 'initiator' ? context.initiatorLibraryEpoch : context.responderLibraryEpoch,
    receiverDeviceId: author === 'initiator' ? context.responderDeviceId : context.initiatorDeviceId,
    receiverLibraryEpoch: author === 'initiator' ? context.responderLibraryEpoch : context.initiatorLibraryEpoch };
}
