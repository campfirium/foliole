import type { FramedSyncPayloadBudget } from '../../lib/core/sync/framedSyncPayloadBudget.js';

const budgets = new WeakMap<object, FramedSyncPayloadBudget>();

/** Database handles and their ports alias the same library-owned product budget. */
export function bindFramedSyncPayloadBudget(owner: object, budget: FramedSyncPayloadBudget) {
  budgets.set(owner, budget);
}

export function readFramedSyncPayloadBudget(owner: object) {
  return budgets.get(owner);
}
