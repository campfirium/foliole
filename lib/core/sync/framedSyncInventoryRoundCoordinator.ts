import { FRAMED_SYNC_FRAME_TYPES } from './framedSyncContract.js';
import { bytes, list, row, text } from './framedSyncDecodedValues.js';
import { assertSessionEnvelopeBinding } from './framedSyncEnvelopeContract.js';
import type { FramedSyncPreamble } from './framedSyncFraming.js';
import {
  classifyFramedSyncInventoryRound,
  compareFramedSyncInventories,
  revalidateFramedSyncInventorySource,
  type FramedSyncDeferredObject,
  type FramedSyncInventoryDifference,
  type FramedSyncInventoryEntry
} from './framedSyncInventory.js';
import { deferUnresolvedBidirectionalObjects } from './framedSyncInventoryRoundResolution.js';
import {
  decodeAndValidateProtocolMessage,
  encodeValidatedProtocolMessage
} from './framedSyncProtocolCodec.js';
import { assertFramePayloadBudget } from './framedSyncReceiver.js';
import type { FramedSyncSessionContext } from './framedSyncSession.js';
import type { OutboundPublishInput } from './framedSyncStagingContract.js';
import type { FramedSyncStagingPort } from './framedSyncStagingPort.js';

type ObjectKey = Readonly<{ globalId: string; objectType: string }>;
type Direction = FramedSyncInventoryDifference['direction'];
type EndpointSide = 'local' | 'remote';

export type FramedSyncRoundSelection =
  | Readonly<{ deferredObjects: readonly FramedSyncDeferredObject[]; kind: 'deferred' }>
  | Readonly<{ kind: 'published'; publication: OutboundPublishInput }>;

export type FramedSyncRoundEndpoint = Readonly<{
  deviceId: string;
  libraryEpoch: string;
  readInventory(): Promise<readonly FramedSyncInventoryEntry[]>;
  readInventoryEntry(key: ObjectKey): Promise<FramedSyncInventoryEntry | null>;
  selectOutbound(difference: FramedSyncInventoryDifference): Promise<FramedSyncRoundSelection>;
  /** `committed` means the exact matching transfer receipt is durable, not merely sent. */
  sendPublishedTransfer(input: Readonly<{
    difference: FramedSyncInventoryDifference;
    publication: OutboundPublishInput;
    receiver: EndpointSide;
  }>): Promise<'committed' | 'pending'>;
  staging: Pick<FramedSyncStagingPort, 'publishOutbound'>;
}>;

export type FramedSyncRoundSessionPort = Readonly<{
  authenticatedContext: Omit<FramedSyncSessionContext, 'sessionId'>;
  preamble: FramedSyncPreamble;
  send(input: Readonly<{
    authorDeviceId: string;
    encodedMessage: Uint8Array;
    frameType: typeof FRAMED_SYNC_FRAME_TYPES.sessionControl;
    recipientDeviceId: string;
  }>): Promise<void>;
}>;

type TransferResult = Readonly<{
  direction: Direction;
  globalId: string;
  objectType: string;
  publication: OutboundPublishInput;
  state: 'committed' | 'pending';
}>;

export type FramedSyncRoundReceipt = Readonly<{
  deferredObjects: readonly FramedSyncDeferredObject[];
  result: 'pending' | 'drained' | 'converged';
  transfers: readonly TransferResult[];
}>;

const sameBytes = (left: Uint8Array, right: Uint8Array) =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

function concat(values: readonly Uint8Array[]) {
  const result = new Uint8Array(values.reduce((total, value) => total + value.byteLength, 0));
  let offset = 0;
  for (const value of values) { result.set(value, offset); offset += value.byteLength; }
  return result;
}

function inventoryEntryToWire(entry: FramedSyncInventoryEntry) {
  return {
    frontierFactIds: entry.frontierFactIds, globalId: entry.globalId,
    objectType: entry.objectType, requiredRelationIds: entry.requiredRelationIds,
    resourceHashes: entry.resourceHashes, reviewFactIds: entry.reviewFactIds,
    sharedStateHash: entry.sharedStateHash
  };
}

function decodedInventoryEntries(value: unknown): readonly FramedSyncInventoryEntry[] {
  return list(row(value).entries).map((item) => {
    const entry = row(item);
    const strings = (key: string) => list(entry[key]).map((part) => text(part, key));
    return {
      frontierFactIds: strings('frontierFactIds'), globalId: text(entry.globalId, 'global_id'),
      objectType: text(entry.objectType, 'object_type'),
      requiredRelationIds: strings('requiredRelationIds'),
      resourceHashes: list(entry.resourceHashes).map((hash) => bytes(hash, 'resource_hash').slice()),
      reviewFactIds: strings('reviewFactIds'),
      sharedStateHash: bytes(entry.sharedStateHash, 'shared_state_hash').slice()
    };
  });
}

async function sendControl(session: FramedSyncRoundSessionPort, authorDeviceId: string,
  recipientDeviceId: string, payloadCase: 'inventory_begin' | 'inventory_chunk' |
  'inventory_end' | 'round_receipt', payload: unknown) {
  const encodedMessage = encodeValidatedProtocolMessage(payloadCase, payload);
  assertFramePayloadBudget(FRAMED_SYNC_FRAME_TYPES.sessionControl, encodedMessage.byteLength);
  const decoded = decodeAndValidateProtocolMessage(
    encodedMessage, FRAMED_SYNC_FRAME_TYPES.sessionControl
  );
  await assertSessionEnvelopeBinding(
    session.authenticatedContext, session.preamble, decoded, authorDeviceId
  );
  await session.send({ authorDeviceId, encodedMessage,
    frameType: FRAMED_SYNC_FRAME_TYPES.sessionControl, recipientDeviceId });
  return decoded;
}

async function exchangeInventory(args: {
  author: FramedSyncRoundEndpoint;
  entries: readonly FramedSyncInventoryEntry[];
  recipient: FramedSyncRoundEndpoint;
  roundId: Uint8Array;
  session: FramedSyncRoundSessionPort;
}) {
  await sendControl(args.session, args.author.deviceId, args.recipient.deviceId,
    'inventory_begin', { entryCount: args.entries.length, roundId: args.roundId });
  const encodedChunks: Uint8Array[] = [];
  const received: FramedSyncInventoryEntry[] = [];
  for (let offset = 0, chunkIndex = 0; offset < args.entries.length;
    offset += 128, chunkIndex += 1) {
    const decoded = await sendControl(args.session, args.author.deviceId, args.recipient.deviceId,
      'inventory_chunk', { chunkIndex, entries: args.entries.slice(offset, offset + 128)
        .map(inventoryEntryToWire), roundId: args.roundId });
    const encoded = encodeValidatedProtocolMessage(decoded.payloadCase, decoded.payload);
    encodedChunks.push(encoded);
    received.push(...decodedInventoryEntries(decoded.payload));
  }
  const inventoryHash = new Uint8Array(await crypto.subtle.digest('SHA-256', concat(encodedChunks)));
  const end = await sendControl(args.session, args.author.deviceId, args.recipient.deviceId,
    'inventory_end', { inventoryHash, roundId: args.roundId });
  if (!sameBytes(bytes(end.payload.inventoryHash, 'inventory_hash'), inventoryHash) ||
      received.length !== args.entries.length) throw new Error('inventory_exchange_incomplete');
  return received;
}

function sourceFor(direction: Direction, local: FramedSyncRoundEndpoint,
  remote: FramedSyncRoundEndpoint): Readonly<{
    endpoint: FramedSyncRoundEndpoint;
    receiver: EndpointSide;
  }> {
  return direction === 'local_to_remote'
    ? { endpoint: local, receiver: 'remote' }
    : { endpoint: remote, receiver: 'local' };
}

function localDifference(difference: FramedSyncInventoryDifference): FramedSyncInventoryDifference {
  return { ...difference, direction: 'local_to_remote' };
}

function addDeferred(target: Map<string, FramedSyncDeferredObject>, values:
readonly FramedSyncDeferredObject[]) {
  for (const value of values) target.set(`${value.objectType}\0${value.globalId}`, value);
}

export async function coordinateFramedSyncInventoryRound(args: {
  local: FramedSyncRoundEndpoint;
  remote: FramedSyncRoundEndpoint;
  roundId: Uint8Array;
  session: FramedSyncRoundSessionPort;
}): Promise<FramedSyncRoundReceipt> {
  const [localSnapshot, remoteSnapshot] = await Promise.all([
    args.local.readInventory(), args.remote.readInventory()
  ]);
  const [localWire, remoteWire] = await Promise.all([
    exchangeInventory({ author: args.local, entries: localSnapshot, recipient: args.remote,
      roundId: args.roundId, session: args.session }),
    exchangeInventory({ author: args.remote, entries: remoteSnapshot, recipient: args.local,
      roundId: args.roundId, session: args.session })
  ]);
  const differences = compareFramedSyncInventories({ local: localWire, remote: remoteWire });
  const deferred = new Map<string, FramedSyncDeferredObject>();
  const outstandingDifferences: FramedSyncInventoryDifference[] = [];
  const transfers: TransferResult[] = [];
  for (const difference of differences) {
    const source = sourceFor(difference.direction, args.local, args.remote);
    const current = await source.endpoint.readInventoryEntry(difference);
    const ready = revalidateFramedSyncInventorySource({ currentSource: current ? [current] : [],
      differences: [localDifference(difference)], direction: 'local_to_remote' });
    if (ready.deferredObjects.length) { addDeferred(deferred, ready.deferredObjects); continue; }
    const selection = await source.endpoint.selectOutbound(localDifference(difference));
    if (selection.kind === 'deferred') {
      addDeferred(deferred, selection.deferredObjects);
      addDeferred(deferred, [{ globalId: difference.globalId, objectType: difference.objectType }]);
      continue;
    }
    await source.endpoint.staging.publishOutbound(selection.publication);
    const state = await source.endpoint.sendPublishedTransfer({
      difference, publication: selection.publication, receiver: source.receiver
    });
    if (state === 'pending') outstandingDifferences.push(difference);
    transfers.push({ direction: difference.direction, globalId: difference.globalId,
      objectType: difference.objectType, publication: selection.publication, state });
  }
  if (!outstandingDifferences.length) {
    await deferUnresolvedBidirectionalObjects(args.local, args.remote, differences, deferred);
  }
  const deferredObjects = [...deferred.values()];
  const result = classifyFramedSyncInventoryRound({ deferredObjects, outstandingDifferences });
  if (result !== 'pending') await Promise.all([args.local, args.remote].map((author) =>
    sendControl(args.session, author.deviceId,
      author === args.local ? args.remote.deviceId : args.local.deviceId, 'round_receipt', {
        deferredFacts: [], result: result === 'drained' ? 1 : 2, roundId: args.roundId
      })));
  return { deferredObjects, result, transfers };
}
