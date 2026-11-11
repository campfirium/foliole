import { z } from 'zod';

import type { DbPort } from './dbPort.js';

const RECEIVE_INTERVAL_MS = 6 * 60 * 60 * 1000;

type ReceiveScope = {
  bindingId: string;
  localEpoch: string;
  peerEpoch: string;
  sourceEpoch: string;
};

const receiptSchema = z.object({
  localEpoch: z.string(),
  peerEpoch: z.string(),
  sourceEpoch: z.string(),
  checkedAt: z.number().int().nonnegative()
});

const key = (scope: ReceiveScope) => `webdav_relay_last_receive:${scope.bindingId}`;

export async function isWebDavRelayReceiveDue(db: DbPort, scope: ReceiveScope, now = Date.now()) {
  const [row] = await db.query<{ value: string }>('SELECT value FROM sync_group_metadata WHERE key = ?', [key(scope)]);
  if (!row) return true;
  const receipt = receiptSchema.safeParse(JSON.parse(row.value)).data;
  if (!receipt || receipt.localEpoch !== scope.localEpoch || receipt.peerEpoch !== scope.peerEpoch ||
      receipt.sourceEpoch !== scope.sourceEpoch) return true;
  const age = now - receipt.checkedAt;
  return age < 0 || age >= RECEIVE_INTERVAL_MS;
}

export async function recordWebDavRelayReceive(db: DbPort, scope: ReceiveScope, checkedAt = Date.now()) {
  const { localEpoch, peerEpoch, sourceEpoch } = scope;
  await db.run(`INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  [key(scope), JSON.stringify({ localEpoch, peerEpoch, sourceEpoch, checkedAt }), new Date(checkedAt).toISOString()]);
}
