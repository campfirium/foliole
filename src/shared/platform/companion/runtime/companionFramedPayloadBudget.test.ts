import { beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ configure: vi.fn(), close: vi.fn(), validate: vi.fn(), release: vi.fn() }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: {
  configureFramedSyncPayloadBudget: native.configure,
  closeFramedSyncPayloadBudget: native.close,
  validateFramedSyncPayloadLoan: native.validate,
  releaseFramedSyncPayloadLoan: native.release
} }));

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';
import {
  closeCompanionFramedPayloadBudget, configureCompanionFramedPayloadBudget, readCompanionFramedPayload
} from './companionFramedPayloadBudget';

beforeEach(() => {
  native.configure.mockReset().mockResolvedValue(undefined);
  native.close.mockReset().mockResolvedValue(undefined);
  native.validate.mockReset().mockResolvedValue({ valid: true });
  native.release.mockReset().mockResolvedValue(undefined);
});

async function fixture() {
  const read = vi.fn(async (task: () => Promise<unknown>) => task());
  const owner = { databasePath: '/actual/library.db', read } as unknown as CapacitorCompanionDatabaseOwner;
  await configureCompanionFramedPayloadBudget(owner);
  const identity = native.configure.mock.calls[0]![0];
  const payload = { payload_loan: {
    ...identity, loan_id: 'native-loan', direction: 'outbound', lane: 'payload', capacity_bytes: 2097152
  } };
  return { owner, payload, read };
}

it('validates the existing native loan before entering the database queue without another grant', async () => {
  const { owner, payload, read } = await fixture();
  let validate!: (value: { valid: true }) => void;
  native.validate.mockReturnValueOnce(new Promise((resolve) => { validate = resolve; }));
  const result = readCompanionFramedPayload(owner, payload, async () => 'bytes');
  expect(native.validate).toHaveBeenCalledWith(payload.payload_loan);
  expect(read).not.toHaveBeenCalled();
  validate({ valid: true });
  await expect(result).resolves.toBe('bytes');
  expect(read).toHaveBeenCalledOnce();
  expect(native.configure).toHaveBeenCalledOnce();
  expect(native.release).toHaveBeenCalledWith(payload.payload_loan);
});

it.each([
  { generation_id: 'expired' }, { library_key: '/other/library.db' }, { direction: 'inbound' },
  { lane: 'metadata' }, { capacity_bytes: 1048576 }, { loan_id: '' }
])('rejects mismatched loan fields before native validation and database access: %j', async (change) => {
  const { owner, payload, read } = await fixture();
  Object.assign(payload.payload_loan, change);
  await expect(readCompanionFramedPayload(owner, payload, async () => 'bytes')).rejects.toThrow('loan_invalid');
  expect(native.validate).not.toHaveBeenCalled();
  expect(native.release).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});

it('rejects a native invalid loan without database access', async () => {
  const { owner, payload, read } = await fixture();
  native.validate.mockResolvedValueOnce({ valid: false });
  await expect(readCompanionFramedPayload(owner, payload, async () => 'bytes')).rejects.toThrow('loan_invalid');
  expect(read).not.toHaveBeenCalled();
  expect(native.release).toHaveBeenCalledWith(payload.payload_loan);
});

it('invalidates a pending validation before closing native grants outside the database queue', async () => {
  const { owner, payload, read } = await fixture();
  let validate!: (value: { valid: true }) => void;
  native.validate.mockReturnValueOnce(new Promise((resolve) => { validate = resolve; }));
  const pending = readCompanionFramedPayload(owner, payload, async () => 'bytes');
  await closeCompanionFramedPayloadBudget(owner);
  validate({ valid: true });
  await expect(pending).rejects.toThrow('loan_invalid');
  expect(native.close).toHaveBeenCalledWith(native.configure.mock.calls[0]![0]);
  expect(read).not.toHaveBeenCalled();
  expect(native.release).toHaveBeenCalledWith(payload.payload_loan);
});

it('keeps a failed close retryable while rejecting all new payload reads', async () => {
  const { owner, payload, read } = await fixture();
  native.close.mockRejectedValueOnce(new Error('drain failed'));
  await expect(closeCompanionFramedPayloadBudget(owner)).rejects.toThrow('drain failed');
  await expect(readCompanionFramedPayload(owner, payload, async () => 'bytes')).rejects.toThrow('loan_invalid');
  await closeCompanionFramedPayloadBudget(owner);
  expect(native.close).toHaveBeenCalledTimes(2);
  expect(read).not.toHaveBeenCalled();
});
