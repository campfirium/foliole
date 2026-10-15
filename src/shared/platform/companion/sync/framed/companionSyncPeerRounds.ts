import { withRequestSyncPeerRound, type RequestSyncPeerRound } from '../../../../../../lib/core/sync/requestSyncPeerRound.js';
import type { RequestSyncAuthenticatedContext } from '../../../../../../lib/core/sync/requestSyncWire.js';
import { runSyncPeerRound } from '../../../../../../lib/core/sync/runSyncPeerRound.js';
import { createSyncPeerRoundOwnership } from '../../../../../../lib/core/sync/syncPeerRoundOwnership.js';
import { subscribeNativeAppBackground } from '../../../appLifecycle.js';
import type { CapacitorCompanionDatabaseOwner } from '../../runtime/capacitorCompanionDatabaseOwner.js';
import { companionFramedFileOwner } from '../../runtime/companionFramedPayloadBudget.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';
import { loadCurrentCredential } from '../syncGroupProviderCredentialStore.js';

import { currentCompanionRequestSyncDatabaseHost } from './companionRequestSyncDatabaseHost.js';
import { createCompanionRequestSyncExchange } from './companionRequestSyncExchange.js';
import { withCompanionRequestSyncLifecycle } from './companionRequestSyncLifecycle.js';

type State = {
  rounds: ReturnType<typeof createSyncPeerRoundOwnership>;
  ready: Promise<void>;
  unsubscribe?: () => void;
};
const states = new WeakMap<CapacitorCompanionDatabaseOwner, State>();

export function withCompanionSyncPeerRound<T>(peerId: string,
  run: (round: RequestSyncPeerRound, signal: AbortSignal) => Promise<T>,
  options: { waitForInbound?: () => boolean; onWaiting?(waiting: boolean): void; signal?: AbortSignal } = {}) {
  return withCompanionRequestSyncLifecycle(async signal => runSyncPeerRound({
    owner: await companionSyncPeerRoundOwner(), peerId, ...options, signal,
    execute: (id, lease) => run({ id, lease, admitted: false }, lease.signal)
  }), options.signal);
}

export async function withCompanionRequestSyncPeerRound<T>(context: RequestSyncAuthenticatedContext,
  endpointUrl: string, peerRound: RequestSyncPeerRound, run: () => Promise<T>) {
  const host = await currentCompanionRequestSyncDatabaseHost();
  const credential = await loadCurrentCredential({ group_id: context.groupId });
  const groupKey = Uint8Array.from(atob(credential.workgroup_key.replaceAll('-', '+').replaceAll('_', '/')),
    character => character.charCodeAt(0));
  const exchange = createCompanionRequestSyncExchange(host, { context, groupKey, endpointUrl,
    peerRound, signal: peerRound.lease.signal });
  return withRequestSyncPeerRound(exchange, peerRound, run);
}

export async function companionSyncPeerRoundOwner() {
  const database = getIosCompanionDatabaseOwner();
  let state = states.get(database);
  if (!state) {
    state = { rounds: createSyncPeerRoundOwnership(60_000), ready: Promise.resolve() };
    const created = state;
    states.set(database, created);
    created.ready = subscribeNativeAppBackground(() => closeCompanionSyncPeerRounds(database))
      .then(unsubscribe => {
        if (states.get(database) !== created) { unsubscribe(); throw new Error('sync_round_owner_closed'); }
        created.unsubscribe = unsubscribe;
      });
  }
  await state.ready;
  return state.rounds;
}

export function closeCompanionSyncPeerRounds(database: CapacitorCompanionDatabaseOwner) {
  const state = states.get(database);
  states.delete(database);
  state?.rounds.close(new Error('request_sync_foreground_ended'));
  state?.unsubscribe?.();
}

export async function touchCompanionSyncPeerRound(payload: Record<string, unknown>) {
  const identity = companionFramedFileOwner(getIosCompanionDatabaseOwner());
  if (payload.library_key !== identity.library_key || payload.generation_id !== identity.generation_id) {
    throw new Error('request_sync_library_changed');
  }
  if (typeof payload.peer_device_id !== 'string' || typeof payload.peer_round_id !== 'string' ||
      (payload.direction !== 'inbound' && payload.direction !== 'outbound')) throw new Error('sync_round_identity_missing');
  const owner = await companionSyncPeerRoundOwner();
  if (payload.finish_round === true && payload.direction === 'inbound') {
    owner.finishInbound(payload.peer_device_id, payload.peer_round_id);
  } else owner.touch(payload.peer_device_id, payload.peer_round_id, payload.direction);
  return { renewed: true };
}
