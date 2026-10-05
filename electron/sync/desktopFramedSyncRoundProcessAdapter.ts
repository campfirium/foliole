import { z } from 'zod';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import {
  FRAMED_SYNC_FRAME_TYPES,
  FRAMED_SYNC_PROTOCOL_VERSION
} from '../../lib/core/sync/framedSyncContract.js';
import { assertSessionEnvelopeBinding } from '../../lib/core/sync/framedSyncEnvelopeContract.js';
import { decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import type { FramedSyncInventoryDifference } from '../../lib/core/sync/framedSyncInventory.js';
import { decodeAndValidateProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import type { OutboundPublishInput } from '../../lib/core/sync/framedSyncStagingContract.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';

import {
  createDesktopFramedSyncRoundEndpoint,
  type DesktopFramedSyncRoundIdentity
} from './desktopFramedSyncRoundEndpoint.js';
import {
  readDesktopFramedSyncRoundInventory,
  readDesktopFramedSyncRoundInventoryEntry
} from './desktopFramedSyncRoundInventory.js';

const bytes = z.instanceof(Uint8Array);
const identity = z.object({ deviceId: z.string().min(1), libraryEpoch: z.string().min(1) });
const entry = z.object({
  frontierFactIds: z.array(z.string().min(1)),
  globalId: z.string().min(1),
  objectType: z.string().min(1),
  requiredRelationIds: z.array(z.string().min(1)),
  resourceHashes: z.array(bytes),
  reviewFactIds: z.array(z.string().min(1)),
  sharedStateHash: bytes
});
const need = z.object({
  frontierFactIds: z.array(z.string().min(1)),
  requiredRelationIds: z.array(z.string().min(1)),
  resourceHashes: z.array(bytes),
  reviewFactIds: z.array(z.string().min(1)),
  sharedState: z.boolean()
});
const difference = z.object({
  direction: z.enum(['local_to_remote', 'remote_to_local']),
  globalId: z.string().min(1),
  need,
  objectType: z.string().min(1),
  sourceSnapshot: entry
});
const authenticatedContext = z.object({
  groupId: z.string().min(1),
  initiatorDeviceId: z.string().min(1),
  initiatorLibraryEpoch: z.string().min(1),
  protocolVersion: z.literal(FRAMED_SYNC_PROTOCOL_VERSION),
  responderDeviceId: z.string().min(1),
  responderLibraryEpoch: z.string().min(1)
});
const command = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('read_inventory') }),
  z.object({ globalId: z.string().min(1), kind: z.literal('read_entry'),
    objectType: z.string().min(1) }),
  z.object({ difference, kind: z.literal('select'), peer: identity,
    peerOrigin: z.string().url() }),
  z.object({ kind: z.literal('publish'), transferId: z.string().regex(/^[a-f0-9]{64}$/u) }),
  z.object({ kind: z.literal('send'), transferId: z.string().regex(/^[a-f0-9]{64}$/u) }),
  z.object({ authenticatedContext, authorDeviceId: z.string().min(1), encodedMessage: bytes,
    kind: z.literal('receive_control'), preamble: bytes }),
  z.object({ kind: z.literal('control_log') })
]);

type CachedSelection = Readonly<{
  difference: FramedSyncInventoryDifference;
  endpoint: ReturnType<typeof createDesktopFramedSyncRoundEndpoint>;
  publication: OutboundPublishInput;
}>;

type AdapterInput = Readonly<{
  db: DbPort;
  groupId: string;
  groupSecret: string;
  local: DesktopFramedSyncRoundIdentity;
  staging: FramedSyncStagingPort;
}>;

const hex = (value: Uint8Array) => Buffer.from(value).toString('hex');

export function createDesktopFramedSyncRoundProcessAdapter(input: AdapterInput) {
  const selections = new Map<string, CachedSelection>();
  const controlLog: string[] = [];
  return async (value: unknown): Promise<unknown> => {
    const request = command.parse(value);
    if (request.kind === 'read_inventory') {
      return readDesktopFramedSyncRoundInventory(input.db);
    }
    if (request.kind === 'read_entry') {
      return readDesktopFramedSyncRoundInventoryEntry(input.db, request);
    }
    if (request.kind === 'select') {
      const endpoint = createDesktopFramedSyncRoundEndpoint({
        ...input,
        peer: request.peer,
        peerOrigin: request.peerOrigin
      });
      const selection = await endpoint.selectOutbound(request.difference);
      if (selection.kind === 'published') {
        selections.set(hex(selection.publication.transferId), {
          difference: request.difference,
          endpoint,
          publication: selection.publication
        });
      }
      return selection;
    }
    if (request.kind === 'publish') {
      const selected = requiredSelection(selections, request.transferId);
      return input.staging.publishOutbound(selected.publication);
    }
    if (request.kind === 'send') {
      const selected = requiredSelection(selections, request.transferId);
      return selected.endpoint.sendPublishedTransfer({
        difference: selected.difference,
        publication: selected.publication,
        receiver: 'remote'
      });
    }
    if (request.kind === 'receive_control') {
      const preamble = decodeFramedSyncPreamble(request.preamble);
      const decoded = decodeAndValidateProtocolMessage(
        request.encodedMessage,
        FRAMED_SYNC_FRAME_TYPES.sessionControl
      );
      await assertSessionEnvelopeBinding(
        request.authenticatedContext,
        preamble,
        decoded,
        request.authorDeviceId
      );
      controlLog.push(decoded.payloadCase);
      return decoded.payloadCase;
    }
    return [...controlLog];
  };
}

function requiredSelection(selections: ReadonlyMap<string, CachedSelection>, transferId: string) {
  const selected = selections.get(transferId);
  if (!selected) throw new Error('framed_sync_round_selection_missing');
  return selected;
}
