import { randomBytes } from 'node:crypto';

import { z } from 'zod';

import type {
  CanonicalValue
} from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { encodeFramedSyncPreamble, type FramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import type { FramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventory.js';
import {
  coordinateFramedSyncInventoryRound,
  type FramedSyncRoundEndpoint,
  type FramedSyncRoundReceipt,
  type FramedSyncRoundSessionPort
} from '../../lib/core/sync/framedSyncInventoryRoundCoordinator.js';
import { deriveSessionContextId, type FramedSyncSessionContext } from '../../lib/core/sync/framedSyncSession.js';

type ProcessPort = Readonly<{ invoke(action: string, args?: Readonly<Record<string, unknown>>):
Promise<unknown> }>;
type ProcessSnapshot = Readonly<{ deviceId: string; origin: string }>;

export type DesktopFramedSyncRoundProcessOptions = Readonly<{
  emptyDeferredSide?: 'left' | 'right';
  inventoryOverride?: Readonly<Partial<Record<'left' | 'right', readonly FramedSyncInventoryEntry[]>>>;
  pendingSide?: 'left' | 'right';
}>;

const bytes = z.instanceof(Uint8Array);
const canonicalValue: z.ZodType<CanonicalValue> = z.lazy(() => z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('bool'), value: z.boolean() }),
  z.object({ kind: z.literal('bytes'), value: bytes }),
  z.object({ kind: z.literal('list'), value: z.array(canonicalValue) }),
  z.object({ kind: z.literal('null') }),
  z.object({ kind: z.literal('object'), value: z.array(z.object({
    name: z.string(), value: canonicalValue
  })) }),
  z.object({ kind: z.literal('signed'), value: z.bigint() }),
  z.object({ kind: z.literal('string'), value: z.string() }),
  z.object({ kind: z.literal('unsigned'), value: z.bigint() })
]));
const blob = z.object({ byteLength: z.bigint(), required: z.boolean(), role: z.number(), sha256: bytes });
const fact = z.object({ blobs: z.array(blob), body: z.array(z.object({
  name: z.string(), value: canonicalValue
})), factId: z.string(), globalId: z.string(), kind: z.number(), objectType: z.string(),
sharedStateHash: bytes });
const context = z.object({
  groupId: z.string(), protocolVersion: z.literal(FRAMED_SYNC_PROTOCOL_VERSION),
  receiverDeviceId: z.string(), receiverLibraryEpoch: z.string(), senderDeviceId: z.string(),
  senderLibraryEpoch: z.string()
});
const publication = z.object({ contentId: bytes, context,
  manifest: z.object({ blobs: z.array(blob), facts: z.array(fact) }), manifestHash: bytes,
  transferId: bytes });
const entry = z.object({ frontierFactIds: z.array(z.string()), globalId: z.string(),
  objectType: z.string(), requiredRelationIds: z.array(z.string()), resourceHashes: z.array(bytes),
  reviewFactIds: z.array(z.string()), sharedStateHash: bytes });
const inventory = z.array(entry);
const selection = z.discriminatedUnion('kind', [
  z.object({ deferredObjects: z.array(z.object({ globalId: z.string(), objectType: z.string() })),
    kind: z.literal('deferred') }),
  z.object({ kind: z.literal('published'), publication })
]);

const hex = (value: Uint8Array) => Buffer.from(value).toString('hex');

async function invokeRound(process: ProcessPort, input: Readonly<Record<string, unknown>>) {
  return process.invoke('round', { input });
}

function createEndpoint(args: {
  local: ProcessSnapshot;
  options: DesktopFramedSyncRoundProcessOptions;
  peer: ProcessSnapshot;
  process: ProcessPort;
  side: 'left' | 'right';
}): FramedSyncRoundEndpoint {
  const identity = { deviceId: args.local.deviceId, libraryEpoch: `${args.local.deviceId}-epoch` };
  return {
    ...identity,
    readInventory: async () => args.options.inventoryOverride?.[args.side] ??
      inventory.parse(await invokeRound(args.process, { kind: 'read_inventory' })),
    readInventoryEntry: async (key) => entry.nullable().parse(await invokeRound(args.process, {
      ...key, kind: 'read_entry'
    })),
    selectOutbound: async (difference) => {
      if (args.options.emptyDeferredSide === args.side) return { deferredObjects: [], kind: 'deferred' };
      return selection.parse(await invokeRound(args.process, {
        difference, kind: 'select',
        peer: { deviceId: args.peer.deviceId, libraryEpoch: `${args.peer.deviceId}-epoch` },
        peerOrigin: args.peer.origin
      }));
    },
    sendPublishedTransfer: async ({ publication: selected }) => {
      if (args.options.pendingSide === args.side) return 'pending';
      return z.enum(['committed', 'pending']).parse(await invokeRound(args.process, {
        kind: 'send', transferId: hex(selected.transferId)
      }));
    },
    staging: { publishOutbound: async (selected) => z.enum(['created', 'identical']).parse(
      await invokeRound(args.process, { kind: 'publish', transferId: hex(selected.transferId) })
    ) }
  };
}

async function createSession(args: {
  left: ProcessSnapshot;
  leftProcess: ProcessPort;
  right: ProcessSnapshot;
  rightProcess: ProcessPort;
}) {
  const authenticatedContext: Omit<FramedSyncSessionContext, 'sessionId'> = {
    groupId: 't326-group', initiatorDeviceId: args.left.deviceId,
    initiatorLibraryEpoch: `${args.left.deviceId}-epoch`, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    responderDeviceId: args.right.deviceId, responderLibraryEpoch: `${args.right.deviceId}-epoch`
  };
  const sessionId = new Uint8Array(randomBytes(16));
  const preamble: FramedSyncPreamble = { compression: 'none',
    contextId: await deriveSessionContextId({ ...authenticatedContext, sessionId }),
    contextKind: 'session', noncePrefix: new Uint8Array(randomBytes(4)), sessionId,
    startingSequence: 0n };
  const encodedPreamble = encodeFramedSyncPreamble(preamble);
  const session: FramedSyncRoundSessionPort = { authenticatedContext, preamble,
    send: async ({ authorDeviceId, encodedMessage, recipientDeviceId }) => {
      const recipient = recipientDeviceId === args.left.deviceId ? args.leftProcess : args.rightProcess;
      await invokeRound(recipient, { authenticatedContext, authorDeviceId, encodedMessage,
        kind: 'receive_control', preamble: encodedPreamble });
    } };
  return session;
}

export async function coordinateDesktopFramedSyncProcessRound(args: {
  left: ProcessSnapshot;
  leftProcess: ProcessPort;
  options?: DesktopFramedSyncRoundProcessOptions;
  right: ProcessSnapshot;
  rightProcess: ProcessPort;
}): Promise<FramedSyncRoundReceipt> {
  const options = args.options ?? {};
  return coordinateFramedSyncInventoryRound({
    local: createEndpoint({ local: args.left, options, peer: args.right,
      process: args.leftProcess, side: 'left' }),
    remote: createEndpoint({ local: args.right, options, peer: args.left,
      process: args.rightProcess, side: 'right' }),
    roundId: new Uint8Array(randomBytes(16)),
    session: await createSession(args)
  });
}

export async function readDesktopFramedSyncRoundControlLog(process: ProcessPort) {
  return z.array(z.string()).parse(await invokeRound(process, { kind: 'control_log' }));
}
