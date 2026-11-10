import { z } from 'zod';

import type { FramedSyncStreamBody } from './framedSyncBinaryStream.js';
import { withControlRequest, type RequestSyncExchange } from './requestSyncDatabaseExchange.js';
import { prepareRequestSyncWire, readRequestSyncWire, type RequestSyncAuthenticatedContext } from './requestSyncWire.js';
import type { SyncPeerRoundLease } from './syncPeerRoundOwnership.js';

export type RequestSyncPeerRound = {
  id: string; lease: SyncPeerRoundLease; admitted: boolean; sessionId?: string;
  onUnconfirmedFinish?(): Promise<void>;
  databaseConfirmed?: boolean;
  attachmentsConfirmed?: boolean;
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
  try { return await run(); }
  finally {
    if (round.admitted && !exchange.signal?.aborted) {
      // Preserve committed data while retiring any session that may still hold the remote round.
      const databaseConfirmed = round.databaseConfirmed === true;
      const attachmentsConfirmed = databaseConfirmed && round.attachmentsConfirmed === true;
      round.databaseConfirmed = false;
      round.attachmentsConfirmed = false;
      await roundControl(exchange, round.id, { databaseConfirmed, attachmentsConfirmed })
        .catch(() => round.onUnconfirmedFinish?.());
    }
  }
}

type Confirmation = { databaseConfirmed: boolean; attachmentsConfirmed: boolean };

async function roundControl(exchange: RequestSyncExchange, id: string, confirmation: Confirmation) {
  const roundId = roundBytes(id);
  await withControlRequest(exchange, '/companion/framed-sync?request=round_finish',
    [{ payloadCase: 'round_receipt', payload: { roundId, result: 1, deferredFacts: [], ...confirmation } }], async response => {
      await validateRoundControl({ ...exchange, stream: response }, roundId);
    });
}

export async function respondRequestSyncRoundControl(input: {
  context: RequestSyncAuthenticatedContext; groupKey: Uint8Array; stream: FramedSyncStreamBody;
  signal?: AbortSignal; roundId: string; onCompleted?: (() => Promise<void>) | undefined;
}) {
  const roundId = roundBytes(input.roundId);
  const confirmed = await validateRoundControl(input, roundId);
  if (confirmed.databaseConfirmed) await input.onCompleted?.();
  return prepareRequestSyncWire({ ...input, messages: async function* () {
    yield { payloadCase: 'round_receipt', payload: { roundId, result: 1, deferredFacts: [], ...confirmed } };
  } });
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
    confirmation = { databaseConfirmed, attachmentsConfirmed };
  }
  if (!confirmation) throw new Error('sync_round_control_missing');
  return confirmation;
}

function roundBytes(id: string) {
  const hex = roundIdSchema.parse(id).replaceAll('-', '');
  return Uint8Array.from({ length: 16 }, (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
}
