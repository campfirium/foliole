import { z } from 'zod';

import type { FramedSyncStreamBody } from './framedSyncBinaryStream.js';
import { withControlRequest, type RequestSyncExchange } from './requestSyncDatabaseExchange.js';
import { prepareRequestSyncWire, readRequestSyncWire, type RequestSyncAuthenticatedContext } from './requestSyncWire.js';
import type { SyncPeerRoundLease } from './syncPeerRoundOwnership.js';
import type { WebDavRelayCleanup } from './webDavRelayCollectionCleanup.js';
import { relayCollectionOffer } from './webDavRelayCollections.js';

export type RequestSyncPeerRound = {
  id: string; lease: SyncPeerRoundLease; admitted: boolean; sessionId?: string;
  onUnconfirmedFinish?(): Promise<void>;
  databaseConfirmed?: boolean;
  attachmentsConfirmed?: boolean;
  relayCleanup?: WebDavRelayCleanup;
};
const roundIdSchema = z.string().uuid();
const modeSchema = z.enum(['start', 'continue', 'finish', 'single']);

export function requestSyncPeerRoundPath(path: string, round?: RequestSyncPeerRound) {
  const url = new URL(path, 'http://localhost');
  url.searchParams.set('peer_round_id', round?.id ?? crypto.randomUUID());
  if (round?.sessionId) url.searchParams.set('sync_session_id', round.sessionId);
  url.searchParams.set('peer_round_mode', round
    ? url.searchParams.get('request') === 'round_finish' ? 'finish' : round.admitted ? 'continue' : 'start'
    : 'single');
  return `${url.pathname}${url.search}`;
}

export function parseRequestSyncPeerRound(id: unknown, mode: unknown) {
  return { id: roundIdSchema.parse(id), mode: modeSchema.parse(mode) };
}

export async function* touchRequestSyncStream<T>(source: AsyncIterable<T>, lease?: SyncPeerRoundLease) {
  for await (const item of source) {
    lease?.touch();
    yield item;
  }
}

export async function withRequestSyncPeerRound<T>(exchange: RequestSyncExchange,
  round: RequestSyncPeerRound, run: () => Promise<T>) {
  let finished = false;
  try {
    const result = await run();
    finished = true;
    return result;
  } finally {
    const cleanup = round.relayCleanup;
    delete round.relayCleanup;
    if (round.admitted && !exchange.signal?.aborted) {
      // Preserve committed data while retiring any session that may still hold the remote round.
      const databaseConfirmed = round.databaseConfirmed === true;
      const attachmentsConfirmed = finished && databaseConfirmed && round.attachmentsConfirmed === true;
      round.databaseConfirmed = false;
      round.attachmentsConfirmed = false;
      await roundControl(exchange, round.id, { databaseConfirmed, attachmentsConfirmed }, cleanup)
        .catch(() => round.onUnconfirmedFinish?.());
    }
  }
}

const relayCleanupSchema = z.object({ offer: relayCollectionOffer.optional(), accepted: z.boolean().optional() });
type RelayCleanup = z.infer<typeof relayCleanupSchema>;
type Confirmation = { databaseConfirmed: boolean; attachmentsConfirmed: boolean; relayCleanup?: string };

async function roundControl(exchange: RequestSyncExchange, id: string, confirmation: Confirmation,
  cleanup: WebDavRelayCleanup | undefined) {
  const roundId = roundBytes(id);
  const relay = confirmation.attachmentsConfirmed ? cleanup : undefined;
  const reply = await withControlRequest(exchange, '/companion/framed-sync?request=round_finish',
    [{ payloadCase: 'round_receipt', payload: { roundId, result: 1, deferredFacts: [], ...confirmation,
      ...(relay ? { relayCleanup: JSON.stringify({ offer: relay.offer }) } : {}) } }],
    response => validateRoundControl({ ...exchange, stream: response }, roundId));
  if (!relay || !reply.relayCleanup) return;
  const received = relayCleanupSchema.parse(JSON.parse(reply.relayCleanup));
  if (received.accepted && relay.offer) await cleanupAction(async () => {
    const retired = await relay.retire();
    if (retired) await relay.delete(retired, 'outgoing');
  });
  const incoming = received.offer;
  if (incoming) await cleanupAction(() => relay.delete(incoming, 'incoming'));
  await cleanupAction(() => relay.forgetDeleted());
}

export async function respondRequestSyncRoundControl(input: {
  context: RequestSyncAuthenticatedContext; groupKey: Uint8Array; stream: FramedSyncStreamBody;
  signal?: AbortSignal; roundId: string; onCompleted?: (() => Promise<void>) | undefined;
  relayCleanup?: WebDavRelayCleanup | undefined;
}) {
  const roundId = roundBytes(input.roundId);
  const { relayCleanup, ...confirmed } = await validateRoundControl(input, roundId);
  if (confirmed.databaseConfirmed) await input.onCompleted?.();
  const relay = relayCleanup && input.relayCleanup
    ? await respondRelayCleanup(input.relayCleanup, relayCleanupSchema.parse(JSON.parse(relayCleanup))) : undefined;
  return prepareRequestSyncWire({ ...input, messages: async function* () {
    yield { payloadCase: 'round_receipt', payload: { roundId, result: 1, deferredFacts: [], ...confirmed,
      ...(relay ? { relayCleanup: JSON.stringify(relay) } : {}) } };
  } });
}

async function respondRelayCleanup(cleanup: WebDavRelayCleanup, received: RelayCleanup): Promise<RelayCleanup> {
  const { offer } = received;
  const accepted = offer ? await cleanupAction(() => cleanup.verify(offer)) : false;
  await cleanupAction(() => cleanup.forgetDeleted());
  const retired = await cleanupAction(() => cleanup.retire());
  return { ...(retired ? { offer: retired } : {}), accepted: accepted === true };
}

async function cleanupAction<T>(action: () => Promise<T>) {
  try { return await action(); }
  catch (error) { console.warn('[sync] WebDAV collection cleanup deferred', error); }
}

async function validateRoundControl(input: {
  context: RequestSyncAuthenticatedContext; groupKey: Uint8Array; stream: FramedSyncStreamBody;
  signal?: AbortSignal;
}, id: Uint8Array) {
  let confirmation: Confirmation | undefined;
  for await (const { message } of readRequestSyncWire({ ...input, ...input.stream })) {
    const roundId = message.payload.roundId;
    if (confirmation || message.payloadCase !== 'round_receipt' || (message.payload.result !== 1 && message.payload.result !== 2) ||
      !(roundId instanceof Uint8Array) || roundId.length !== id.length || roundId.some((byte, index) => byte !== id[index])) {
      throw new Error('sync_round_control_invalid');
    }
    const databaseConfirmed = message.payload.databaseConfirmed === true || message.payload.result === 2;
    const attachmentsConfirmed = message.payload.attachmentsConfirmed === true;
    if (attachmentsConfirmed && message.payload.databaseConfirmed !== true) {
      throw new Error('sync_round_control_invalid');
    }
    const relayCleanup = message.payload.relayCleanup;
    if (typeof relayCleanup === 'string' && relayCleanup && !attachmentsConfirmed) {
      throw new Error('sync_round_control_invalid');
    }
    confirmation = { databaseConfirmed, attachmentsConfirmed,
      ...(typeof relayCleanup === 'string' && relayCleanup ? { relayCleanup } : {}) };
  }
  if (!confirmation) throw new Error('sync_round_control_missing');
  return confirmation;
}

function roundBytes(id: string) {
  const hex = roundIdSchema.parse(id).replaceAll('-', '');
  return Uint8Array.from({ length: 16 }, (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
}
