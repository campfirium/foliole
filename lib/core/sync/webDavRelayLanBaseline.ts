import { z } from 'zod';

import type { WebDavRelayBinding } from '../../platform/webDavRelayContract.js';

import type { DbPort } from './dbPort.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import type { RequestSyncAuthenticatedContext } from './requestSyncWire.js';
import { syncGroupLocalPublicationBlockReason } from './syncGroupLocalAdoption.js';
import { recordWebDavRelayReceive } from './webDavRelayReceiveFreshness.js';

const positionSchema = z.object({
  sourceEpoch: z.string().min(1),
  sequence: z.number().int().nonnegative()
});

const baselineSchema = positionSchema.extend({
  localEpoch: z.string().min(1),
  peerEpoch: z.string().min(1),
  capturedAt: z.number().int().positive().optional()
});

type Baseline = z.infer<typeof baselineSchema>;
type Scope = {
  binding: WebDavRelayBinding;
  localDevice: string;
  localEpoch: string;
  peerEpoch: string;
};

async function readPosition(db: DbPort, scope: Scope) {
  if (await syncGroupLocalPublicationBlockReason(db)) return null;
  const [row] = await db.query(`SELECT seq.source_epoch AS sourceEpoch, seq.high_water AS sequence
    FROM sync_state_sequence seq
    JOIN node_version_local_proof_state proof ON proof.singleton_id = seq.singleton_id
    JOIN sync_group_local_state local ON local.singleton_id = seq.singleton_id
    WHERE seq.singleton_id = 1 AND proof.library_epoch = ? AND local.group_id = ?
      AND local.local_device_identity_key = ? AND local.state = 'active'`,
  [scope.localEpoch, scope.binding.group_id, scope.localDevice]);
  return positionSchema.safeParse(row).data ?? null;
}

function baselineKey(scope: Scope) {
  return `webdav_relay_baseline:${scope.binding.id}`;
}

async function readStoredBaseline(db: DbPort, scope: Scope) {
  const [row] = await db.query<{ value: string; updated_at: string }>('SELECT value, updated_at FROM sync_group_metadata WHERE key = ?', [baselineKey(scope)]);
  if (!row) return null;
  const baseline = baselineSchema.parse(JSON.parse(row.value));
  return { ...baseline, capturedAt: baseline.capturedAt ?? Date.parse(row.updated_at) };
}

function sameEpochs(left: Baseline, right: Baseline) {
  return left.localEpoch === right.localEpoch && left.peerEpoch === right.peerEpoch && left.sourceEpoch === right.sourceEpoch;
}

export async function readWebDavRelayLanBaseline(db: DbPort, scope: Scope) {
  const baseline = await readStoredBaseline(db, scope);
  const current = await readPosition(db, scope);
  return baseline && current && sameEpochs(baseline, { ...scope, ...current }) && baseline.sequence <= current.sequence
    ? baseline : null;
}

export async function captureWebDavRelayLanBaseline(host: RequestSyncDatabaseHost, binding: WebDavRelayBinding | null | undefined,
  context: RequestSyncAuthenticatedContext, role: 'initiator' | 'responder', signal?: AbortSignal) {
  if (!binding || binding.group_id !== context.groupId ||
    !((binding.desktop_device_id === context.initiatorDeviceId && binding.phone_device_id === context.responderDeviceId) ||
      (binding.phone_device_id === context.initiatorDeviceId && binding.desktop_device_id === context.responderDeviceId))) return;
  const initiator = role === 'initiator';
  const scope = { binding, localDevice: initiator ? context.initiatorDeviceId : context.responderDeviceId,
    localEpoch: initiator ? context.initiatorLibraryEpoch : context.responderLibraryEpoch,
    peerEpoch: initiator ? context.responderLibraryEpoch : context.initiatorLibraryEpoch };
  const captured = await host.readSnapshot(async db => {
    const position = await readPosition(db, scope);
    return position && { localEpoch: scope.localEpoch, peerEpoch: scope.peerEpoch, ...position, capturedAt: Date.now() };
  }, signal);
  if (!captured) return;

  // Confirmation may follow more local commits. Only the pre-inventory position is covered here.
  return async () => {
    signal?.throwIfAborted();
    return host.write(db => db.transaction(async tx => {
      const current = await readPosition(tx, scope);
      if (!current || !sameEpochs(captured, { ...scope, ...current }) || current.sequence < captured.sequence) return;
      const previous = await readStoredBaseline(tx, scope);
      await recordWebDavRelayReceive(tx, { bindingId: binding.id, ...captured });
      if (previous && sameEpochs(previous, captured)) return;
      await tx.run(`INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [baselineKey(scope), JSON.stringify(captured), new Date().toISOString()]);
      return true;
    }));
  };
}

export function createWebDavRelayInboundBaselines() {
  type Capture = ReturnType<typeof captureWebDavRelayLanBaseline>;
  const byRound = new WeakMap<AbortSignal, Capture>();
  return {
    async capture(round: AbortSignal, capture: () => Capture) {
      if (!byRound.has(round)) byRound.set(round, capture());
      await byRound.get(round);
    },
    async confirm(round: AbortSignal) {
      const confirm = await byRound.get(round);
      return confirm?.();
    }
  };
}
