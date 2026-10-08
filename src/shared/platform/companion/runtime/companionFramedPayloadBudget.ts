import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type {
  NativeCompanionFramedPayloadBudgetOwner,
  NativeCompanionFramedPayloadLoan
} from '../../../../../lib/platform/nativeCompanionFramedPayloadBudgetContract';
import { createCompanionUuid } from '../../companionUuid';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';

interface BudgetState {
  identity: NativeCompanionFramedPayloadBudgetOwner;
  closing: boolean;
}
const owners = new WeakMap<CapacitorCompanionDatabaseOwner, BudgetState>();

export async function configureCompanionFramedPayloadBudget(owner: CapacitorCompanionDatabaseOwner) {
  if (owners.has(owner)) throw new Error('framed_sync_payload_budget_already_configured');
  const identity = { library_key: owner.databasePath, generation_id: createCompanionUuid() };
  await FolioleCompanionSync.configureFramedSyncPayloadBudget(identity);
  owners.set(owner, { identity, closing: false });
}

export async function closeCompanionFramedPayloadBudget(owner: CapacitorCompanionDatabaseOwner) {
  const state = owners.get(owner);
  if (!state) return;
  state.closing = true;
  await FolioleCompanionSync.closeFramedSyncPayloadBudget(state.identity);
  owners.delete(owner);
}

export async function readCompanionFramedPayload<T>(
  owner: CapacitorCompanionDatabaseOwner,
  payload: Record<string, unknown>,
  read: (db: DbPort) => Promise<T>
) {
  return withCompanionFramedPayload(owner, payload, () => owner.read(read));
}

export async function withCompanionFramedPayload<T>(
  owner: CapacitorCompanionDatabaseOwner,
  payload: Record<string, unknown>,
  task: () => Promise<T>,
  replyInvalid?: (error: unknown) => Promise<T>
) {
  const state = owners.get(owner);
  let loan: NativeCompanionFramedPayloadLoan | undefined;
  try {
    try {
      loan = parseLoan(payload.payload_loan, state?.closing ? undefined : state?.identity);
      const result = await FolioleCompanionSync.validateFramedSyncPayloadLoan(loan);
      if (result?.valid !== true || owners.get(owner) !== state || state?.closing) {
        throw new Error('framed_sync_payload_loan_invalid');
      }
    } catch (error) {
      if (replyInvalid) return await replyInvalid(error);
      throw error;
    }
    return await task();
  } finally {
    if (loan) await FolioleCompanionSync.releaseFramedSyncPayloadLoan(loan);
  }
}

function parseLoan(value: unknown, identity: NativeCompanionFramedPayloadBudgetOwner | undefined) {
  if (!identity || !value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('framed_sync_payload_loan_invalid');
  }
  const loan = value as Record<string, unknown>;
  if (loan.library_key !== identity.library_key || loan.generation_id !== identity.generation_id
    || typeof loan.loan_id !== 'string' || !loan.loan_id.trim()
    || loan.direction !== 'outbound' || loan.lane !== 'payload' || loan.capacity_bytes !== 2097152) {
    throw new Error('framed_sync_payload_loan_invalid');
  }
  return {
    library_key: identity.library_key, generation_id: identity.generation_id,
    loan_id: loan.loan_id, direction: 'outbound', lane: 'payload', capacity_bytes: 2097152
  } satisfies NativeCompanionFramedPayloadLoan;
}
