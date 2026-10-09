import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { PreparedTransferAttempt } from '../../lib/core/sync/framedSyncContract.js';
import { readFramedSyncPayloadBudget } from '../database/framedSyncPayloadBudgetOwner.js';

import { retainDesktopFramedSyncSealedBody } from './desktopFramedSyncSealedBody.js';
import type { FramedSyncWritableBody } from './desktopFramedSyncStream.js';

type Delivery = { attempt: PreparedTransferAttempt; body: FramedSyncWritableBody };
type Owner = { references: number; prepared: Promise<Delivery> };
const libraries = new WeakMap<object, Map<string, Owner>>();

/** Simultaneous push and pull of the exact same publication share its sealed attempt, not a reader. */
export async function retainDesktopFramedSyncPublishedDelivery(db: DbPort, transferId: Uint8Array,
  prepare: () => Promise<Delivery>): Promise<Delivery> {
  const library = readFramedSyncPayloadBudget(db) ?? db;
  let deliveries = libraries.get(library);
  if (!deliveries) { deliveries = new Map(); libraries.set(library, deliveries); }
  const key = Buffer.from(transferId).toString('hex');
  let owner = deliveries.get(key);
  if (!owner) {
    owner = { references: 0, prepared: prepare() };
    deliveries.set(key, owner);
  }
  owner.references++;
  const release = async () => {
    if (--owner.references) return;
    deliveries.delete(key);
    const prepared = await owner.prepared.catch(() => null);
    await prepared?.body.dispose?.();
  };
  try {
    const prepared = await owner.prepared;
    const body = retainDesktopFramedSyncSealedBody(prepared.body);
    return { attempt: prepared.attempt, body: ownedDeliveryBody(body, release) };
  } catch (error) {
    await release();
    throw error;
  }
}

function ownedDeliveryBody(body: FramedSyncWritableBody, release: () => Promise<void>): FramedSyncWritableBody {
  let disposed = false;
  async function dispose() {
    if (disposed) return;
    disposed = true;
    try { await body.dispose?.(); } finally { await release(); }
  }
  return { ...body, dispose };
}
