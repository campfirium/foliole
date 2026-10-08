import { expect, it } from 'vitest';

import {
  canonicalContentId,
  canonicalTransferId,
  type CanonicalBlob,
  type CanonicalManifest
} from './framedSyncCanonicalManifest.js';
import {
  FRAMED_SYNC_LIMITS,
  FRAMED_SYNC_PROTOCOL_VERSION,
  type FramedSyncContext
} from './framedSyncContract.js';
import type { FramedSyncPreamble } from './framedSyncFraming.js';
import type { FramedSyncInventoryDifference, FramedSyncInventoryEntry } from './framedSyncInventory.js';
import {
  coordinateFramedSyncInventoryRound,
  type FramedSyncRoundEndpoint,
  type FramedSyncRoundSelection,
  type FramedSyncRoundSessionPort
} from './framedSyncInventoryRoundCoordinator.js';
import { decodeFramedSyncInventory } from './framedSyncInventoryWire.js';
import { decodeAndValidateProtocolMessage } from './framedSyncProtocolCodec.js';
import {
  deriveSessionContextId,
  type FramedSyncSessionContext
} from './framedSyncSession.js';
import { assertOutboundPublication, type OutboundPublishInput } from './framedSyncStagingContract.js';

const hash = (byte: number) => new Uint8Array(32).fill(byte);
const roundId = (byte: number) => new Uint8Array(16).fill(byte);

function entry(globalId: string, factId: string, bodyHash: Uint8Array): FramedSyncInventoryEntry {
  return {
    frontierFactIds: [factId], globalId, objectType: 'node', requiredRelationIds: [],
    resourceHashes: [bodyHash], reviewFactIds: [], sharedStateHash: hash(bodyHash[0] ?? 0)
  };
}

type EndpointControl = Readonly<{
  endpoint: FramedSyncRoundEndpoint;
  published: OutboundPublishInput[];
  selected: FramedSyncInventoryDifference[];
  sent: OutboundPublishInput[];
  setBeforeRead(value: (() => void) | undefined): void;
  setInventory(value: readonly FramedSyncInventoryEntry[]): void;
}>;

function createEndpoint(args: {
  deviceId: string;
  inventory: readonly FramedSyncInventoryEntry[];
  peerDeviceId: string;
  selectEmptyDeferred?: boolean;
  sendState?: 'committed' | 'pending';
}): EndpointControl {
  let inventory = args.inventory;
  let beforeRead: (() => void) | undefined;
  const published: OutboundPublishInput[] = [];
  const selected: FramedSyncInventoryDifference[] = [];
  const sent: OutboundPublishInput[] = [];
  const find = (key: Readonly<{ globalId: string; objectType: string }>) =>
    inventory.find((item) => item.globalId === key.globalId && item.objectType === key.objectType) ?? null;
  const publish = async (
    difference: FramedSyncInventoryDifference
  ): Promise<FramedSyncRoundSelection> => {
    selected.push(difference);
    if (args.selectEmptyDeferred) return { deferredObjects: [], kind: 'deferred' };
    const blobs: CanonicalBlob[] = difference.need.resourceHashes.map((sha256) => ({
      byteLength: 1n, required: true, role: 1, sha256
    }));
    const manifest: CanonicalManifest = { blobs, facts: difference.need.frontierFactIds.map((factId) => ({
      blobs, body: [{ name: 'body', value: { kind: 'string', value: `${args.deviceId}:${factId}` } }],
      factId, globalId: difference.globalId, kind: 2, objectType: difference.objectType,
      sharedStateHash: difference.sourceSnapshot.sharedStateHash
    })) };
    const context: FramedSyncContext = {
      groupId: 'group-1', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      receiverDeviceId: args.peerDeviceId, receiverLibraryEpoch: `${args.peerDeviceId}-epoch`,
      senderDeviceId: args.deviceId, senderLibraryEpoch: `${args.deviceId}-epoch`
    };
    const contentId = await canonicalContentId(manifest);
    const publication = { contentId, context, manifest, manifestHash: contentId.slice(),
      transferId: await canonicalTransferId(context, contentId) };
    return { kind: 'published', publication };
  };
  return {
    endpoint: {
      deviceId: args.deviceId, libraryEpoch: `${args.deviceId}-epoch`,
      readInventory: async () => inventory,
      readInventoryEntry: async (key) => { beforeRead?.(); beforeRead = undefined; return find(key); },
      selectOutbound: publish,
      sendPublishedTransfer: async ({ publication }) => {
        sent.push(publication); return args.sendState ?? 'committed';
      },
      staging: { publishOutbound: async (publication) => {
        await assertOutboundPublication(publication); published.push(publication); return 'created';
      } }
    },
    published, selected, sent,
    setBeforeRead: (value) => { beforeRead = value; },
    setInventory: (value) => { inventory = value; }
  };
}

async function createSession() {
  const authenticatedContext: Omit<FramedSyncSessionContext, 'sessionId'> = {
    groupId: 'group-1', initiatorDeviceId: 'device-a', initiatorLibraryEpoch: 'device-a-epoch',
    protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, responderDeviceId: 'device-b',
    responderLibraryEpoch: 'device-b-epoch'
  };
  const sessionId = roundId(90);
  const preamble: FramedSyncPreamble = {
    compression: 'none',
    contextId: await deriveSessionContextId({ ...authenticatedContext, sessionId }),
    contextKind: 'session', noncePrefix: new Uint8Array(4).fill(3),
    sessionId, startingSequence: 0n
  };
  const messages: ReturnType<typeof decodeAndValidateProtocolMessage>[] = [];
  const session: FramedSyncRoundSessionPort = {
    authenticatedContext, preamble,
    send: async ({ encodedMessage, frameType }) => {
      messages.push(decodeAndValidateProtocolMessage(encodedMessage, frameType));
    }
  };
  return { messages, session };
}

it('sends each side only the object and body absent from its peer in one round', async () => {
  const local = createEndpoint({ deviceId: 'device-a', inventory: [entry('node-a', 'version-a', hash(11))],
    peerDeviceId: 'device-b' });
  const remote = createEndpoint({ deviceId: 'device-b', inventory: [entry('node-b', 'version-b', hash(12))],
    peerDeviceId: 'device-a' });
  const { messages, session } = await createSession();

  const receipt = await coordinateFramedSyncInventoryRound({
    local: local.endpoint, remote: remote.endpoint, roundId: roundId(1), session
  });

  expect(receipt.result).toBe('converged');
  expect(receipt.transfers.map((item) => [item.direction, item.globalId, item.state])).toEqual([
    ['local_to_remote', 'node-a', 'committed'],
    ['remote_to_local', 'node-b', 'committed']
  ]);
  expect(local.selected.map((item) => [item.direction, item.globalId, item.need.resourceHashes[0]?.[0]]))
    .toEqual([['local_to_remote', 'node-a', 11]]);
  expect(remote.selected.map((item) => [item.direction, item.globalId, item.need.resourceHashes[0]?.[0]]))
    .toEqual([['local_to_remote', 'node-b', 12]]);
  expect(local.published).toEqual(local.sent);
  expect(remote.published).toEqual(remote.sent);
  expect(messages.map((message) => message.payloadCase)).toEqual([
    'inventory_begin', 'inventory_begin', 'inventory_chunk', 'inventory_chunk',
    'inventory_end', 'inventory_end', 'round_receipt', 'round_receipt'
  ]);
});

it('defers a changed source object, then selects its new state in the next full round', async () => {
  const first = entry('node-a', 'version-1', hash(21));
  const second = entry('node-a', 'version-2', hash(22));
  const local = createEndpoint({ deviceId: 'device-a', inventory: [first], peerDeviceId: 'device-b' });
  const remote = createEndpoint({ deviceId: 'device-b', inventory: [], peerDeviceId: 'device-a' });
  local.setBeforeRead(() => local.setInventory([second]));
  const firstSession = await createSession();

  const drained = await coordinateFramedSyncInventoryRound({
    local: local.endpoint, remote: remote.endpoint, roundId: roundId(2), session: firstSession.session
  });
  const secondSession = await createSession();
  const converged = await coordinateFramedSyncInventoryRound({
    local: local.endpoint, remote: remote.endpoint, roundId: roundId(3), session: secondSession.session
  });

  expect(drained).toMatchObject({ deferredObjects: [{ globalId: 'node-a', objectType: 'node' }],
    result: 'drained', transfers: [] });
  expect(converged.result).toBe('converged');
  expect(local.selected.map((item) => item.sourceSnapshot.frontierFactIds)).toEqual([['version-2']]);
  expect(local.published[0]?.manifest.facts.map((fact) => fact.factId)).toEqual(['version-2']);
});

it('keeps the round pending and emits no terminal receipt while a transfer is outstanding', async () => {
  const local = createEndpoint({ deviceId: 'device-a', inventory: [entry('node-a', 'v1', hash(31))],
    peerDeviceId: 'device-b', sendState: 'pending' });
  const remote = createEndpoint({ deviceId: 'device-b', inventory: [], peerDeviceId: 'device-a' });
  const { messages, session } = await createSession();

  const receipt = await coordinateFramedSyncInventoryRound({
    local: local.endpoint, remote: remote.endpoint, roundId: roundId(4), session
  });

  expect(receipt.result).toBe('pending');
  expect(receipt.transfers[0]?.state).toBe('pending');
  expect(messages.some((message) => message.payloadCase === 'round_receipt')).toBe(false);
});

it('does not converge when an outbound adapter returns an empty deferred selection', async () => {
  const local = createEndpoint({ deviceId: 'device-a', inventory: [entry('node-a', 'v1', hash(41))],
    peerDeviceId: 'device-b', selectEmptyDeferred: true });
  const remote = createEndpoint({ deviceId: 'device-b', inventory: [], peerDeviceId: 'device-a' });
  const { messages, session } = await createSession();

  const receipt = await coordinateFramedSyncInventoryRound({
    local: local.endpoint, remote: remote.endpoint, roundId: roundId(5), session
  });

  expect(receipt).toMatchObject({
    deferredObjects: [{ globalId: 'node-a', objectType: 'node' }], result: 'drained', transfers: []
  });
  const roundReceipts = messages.filter((message) => message.payloadCase === 'round_receipt');
  expect(roundReceipts).toHaveLength(2);
  expect(roundReceipts.every((message) => message.payload.result === 1)).toBe(true);
});

it('exchanges large valid inventory entries in bounded frames without losing the tail', async () => {
  const inventory = Array.from({ length: 131 }, (_, index) => ({
    ...entry(`node-${String(index).padStart(3, '0')}`, 'version', hash(11)),
    frontierFactIds: Array.from({ length: 256 }, (_, fact) => `fact-${fact}-${'x'.repeat(40)}`)
  }));
  const local = createEndpoint({ deviceId: 'device-a', inventory, peerDeviceId: 'device-b' });
  const remote = createEndpoint({ deviceId: 'device-b', inventory, peerDeviceId: 'device-a' });
  const { session } = await createSession();
  const received = new Map<string, ReturnType<typeof decodeAndValidateProtocolMessage>[]>();
  const result = await coordinateFramedSyncInventoryRound({ local: local.endpoint,
    remote: remote.endpoint, roundId: roundId(6), session: { ...session, send: async (message) => {
      expect(message.encodedMessage.byteLength).toBeLessThanOrEqual(FRAMED_SYNC_LIMITS.maxControlMessageBytes);
      const decoded = decodeAndValidateProtocolMessage(message.encodedMessage, message.frameType);
      if (!decoded.payloadCase.startsWith('inventory_')) return;
      const messages = received.get(message.authorDeviceId) ?? [];
      messages.push(decoded); received.set(message.authorDeviceId, messages);
    } } });
  expect(result).toMatchObject({ result: 'converged', transfers: [], deferredObjects: [] });
  for (const author of ['device-a', 'device-b']) {
    const messages = received.get(author) ?? [];
    expect(messages.filter(message => message.payloadCase === 'inventory_chunk').length).toBeGreaterThan(2);
    expect((await decodeFramedSyncInventory(messages)).entries).toEqual(inventory);
  }
});
