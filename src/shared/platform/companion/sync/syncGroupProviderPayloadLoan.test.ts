import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listener: null as null | ((request: unknown) => void),
  configure: vi.fn(), close: vi.fn(), validate: vi.fn(), resolve: vi.fn(), read: vi.fn(), writer: vi.fn(),
  body: vi.fn(), fact: vi.fn(), release: vi.fn(), prepare: vi.fn(), inspect: vi.fn(), inventory: vi.fn()
}));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: {
  addListener: async (_name: string, listener: (request: unknown) => void) => {
    mocks.listener = listener;
    return { remove: vi.fn() };
  },
  configureFramedSyncPayloadBudget: mocks.configure, closeFramedSyncPayloadBudget: mocks.close,
  validateFramedSyncPayloadLoan: mocks.validate, releaseFramedSyncPayloadLoan: mocks.release,
  resolveSyncGroupDataRequest: mocks.resolve
} }));
vi.mock('../../companionSyncWriterQueue', () => ({ runCompanionSyncWriterTask: mocks.writer }));
vi.mock('../../../../../lib/core/sync/framedSyncPublishedBodyOperation', () => ({
  readFramedSyncPublishedBodyOperation: mocks.body
}));
vi.mock('../../../../../lib/core/sync/framedSyncPublishedFactOperation', () => ({
  readFramedSyncPublishedFactOperation: mocks.fact
}));
vi.mock('./framed/companionFramedSyncOutbound', () => ({
  prepareCompanionFramedSyncOutbound: mocks.prepare, inspectCompanionFramedSyncOutbound: mocks.inspect
}));
vi.mock('./framed/companionFramedSyncDataOperation', () => ({ readCompanionFramedSyncInventory: mocks.inventory }));
vi.mock('./framed/companionFramedSyncPeerRoutes', () => ({ resumeCompanionFramedSyncRespondingPeer: async () => undefined }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => owner }));

import { canonicalTransferId } from '../../../../../lib/core/sync/framedSyncCanonicalManifest';
import type { CapacitorCompanionDatabaseOwner } from '../runtime/capacitorCompanionDatabaseOwner';

const owner = { databasePath: '/actual/library.db', read: mocks.read } as unknown as CapacitorCompanionDatabaseOwner;
let loan: Record<string, unknown>;

beforeEach(async () => {
  vi.resetAllMocks();
  vi.resetModules();
  mocks.configure.mockResolvedValue(undefined);
  mocks.validate.mockResolvedValue({ valid: true });
  mocks.release.mockResolvedValue(undefined);
  mocks.read.mockImplementation((task: (db: unknown) => Promise<unknown>) => task({}));
  mocks.body.mockResolvedValue({ bytes: [1] });
  mocks.fact.mockResolvedValue({ message_bytes: [2], last_fragment: true });
  mocks.prepare.mockResolvedValue({ kind: 'prepare' });
  mocks.inspect.mockResolvedValue({ kind: 'inspect' });
  mocks.inventory.mockResolvedValue({ kind: 'inventory' });
  mocks.writer.mockImplementation((task: () => Promise<unknown>) => task());
  Object.assign(owner, { runWriter: mocks.read });
  const budget = await import('../runtime/companionFramedPayloadBudget');
  await budget.configureCompanionFramedPayloadBudget(owner);
  loan = { ...mocks.configure.mock.calls[0]![0], loan_id: 'original-native-loan',
    direction: 'outbound', lane: 'payload', capacity_bytes: 2097152 };
  const data = await import('./syncGroupProviderDataOwner');
  await data.ensureCompanionSyncGroupDataOwner();
});

it.each([
  ['prepare_framed_outbound', 'prepare', true], ['inspect_framed_outbound', 'inspect', false],
  ['read_framed_inventory', 'inventory', false]
])('borrows %s outside both queues and retains its loan until reply', async (operation, kind, writes) => {
  let validate!: (value: { valid: true }) => void;
  let reply!: () => void;
  mocks.validate.mockReturnValueOnce(new Promise((resolve) => { validate = resolve; }));
  mocks.resolve.mockReturnValueOnce(new Promise<void>((resolve) => { reply = resolve; }));
  mocks.listener?.({ operation, request_id: 'metadata', payload: { payload_loan: loan } });
  expect(mocks.validate).toHaveBeenCalledWith(loan);
  expect(mocks.writer).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
  validate({ valid: true });
  await vi.waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith({ request_id: 'metadata', result: { kind } }));
  expect(mocks.writer).toHaveBeenCalledTimes(writes ? 1 : 0);
  expect(mocks.release).not.toHaveBeenCalled();
  reply();
  await vi.waitFor(() => expect(mocks.release).toHaveBeenCalledWith(loan));
  expect(mocks.configure).toHaveBeenCalledOnce();
});

it.each(['read_framed_body', 'read_framed_outbound_fact'])('validates %s before entering any queue', async (operation) => {
  let validate!: (value: { valid: true }) => void;
  mocks.validate.mockReturnValueOnce(new Promise((resolve) => { validate = resolve; }));
  mocks.listener?.({ operation, request_id: 'payload', payload: { payload_loan: loan } });
  expect(mocks.validate).toHaveBeenCalledWith(loan);
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.writer).not.toHaveBeenCalled();
  validate({ valid: true });
  await vi.waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith({
    request_id: 'payload', result: operation === 'read_framed_body'
      ? { bytes: [1] } : { message_bytes: [2], last_fragment: true }
  }));
  expect(mocks.configure).toHaveBeenCalledOnce();
  expect(mocks.read).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(mocks.release).toHaveBeenCalledWith(loan));
});

it('rejects an expired generation before either database or writer queue', async () => {
  mocks.listener?.({ operation: 'read_framed_outbound_fact', request_id: 'expired',
    payload: { payload_loan: { ...loan, generation_id: 'expired' } } });
  await vi.waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith({
    request_id: 'expired', error: 'framed_sync_payload_loan_invalid'
  }));
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.writer).not.toHaveBeenCalled();
  expect(mocks.validate).not.toHaveBeenCalled();
  expect(mocks.release).not.toHaveBeenCalled();
});

it('allows receipt-only control while outbound payload validation is waiting', async () => {
  let validate!: (value: { valid: true }) => void;
  mocks.validate.mockReturnValueOnce(new Promise((resolve) => { validate = resolve; }));
  mocks.listener?.({ operation: 'read_framed_outbound_fact', request_id: 'occupied', payload: { payload_loan: loan } });
  const contentId = 'ab'.repeat(32);
  const context = { groupId: 'group', senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch',
    receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch', protocolVersion: 22 as const };
  const transferId = [...await canonicalTransferId(context, new Uint8Array(32).fill(0xab))]
    .map((value) => value.toString(16).padStart(2, '0')).join('');
  const actual = await vi.importActual<typeof import('./framed/companionFramedSyncOutbound')>('./framed/companionFramedSyncOutbound');
  mocks.inspect.mockImplementationOnce(actual.inspectCompanionFramedSyncOutbound);
  const query = vi.fn<(...args: unknown[]) => Promise<{ content_id: string }[]>>(async () => [{ content_id: contentId }]);
  mocks.read.mockImplementationOnce((task: (db: unknown) => Promise<unknown>) => task({ query }));
  mocks.listener?.({ operation: 'inspect_framed_outbound', request_id: 'receipt', payload: {
    receipt_only: true, transfer_id: transferId, group_id: 'group', sender_device_id: 'sender',
    sender_library_epoch: 'sender-epoch', receiver_device_id: 'receiver', receiver_library_epoch: 'receiver-epoch'
  } });
  await vi.waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith({ request_id: 'receipt', result: {
    content_id: contentId, resource_storage_keys: []
  } }));
  expect(mocks.validate).toHaveBeenCalledOnce();
  expect(query).toHaveBeenCalledWith(expect.stringContaining('SELECT lower(hex(content_id))'), expect.any(Array));
  expect(query.mock.calls[0]![0]).not.toContain('manifest_json');
  expect(mocks.release).not.toHaveBeenCalled();
  validate({ valid: true });
  await vi.waitFor(() => expect(mocks.release).toHaveBeenCalledWith(loan));
});

it.each([{}, { receipt_only: false }, { receipt_only: 'true' }, { receipt_only: true }])('rejects ordinary inspect without a loan: %j', async (payload) => {
  mocks.listener?.({ operation: 'inspect_framed_outbound', request_id: 'unborrowed', payload });
  await vi.waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith({
    request_id: 'unborrowed', error: 'framed_sync_payload_loan_invalid'
  }));
  expect(mocks.inspect).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
});

it.each(['resolve', 'reject'] as const)('holds the original producer loan through a late reply %s after consumer timeout', async (settlement) => {
  let finishRead!: () => void;
  let finishReply!: () => void;
  mocks.read.mockImplementationOnce(async (task: (db: unknown) => Promise<unknown>) => {
    await new Promise<void>((resolve) => { finishRead = resolve; });
    return task({});
  });
  mocks.resolve.mockImplementationOnce(() => new Promise<void>((resolve, reject) => {
    finishReply = () => settlement === 'resolve' ? resolve() : reject(new Error('native request expired'));
  }));
  mocks.listener?.({ operation: 'read_framed_outbound_fact', request_id: 'late', payload: { payload_loan: loan } });
  await vi.waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
  expect(mocks.release).not.toHaveBeenCalled();
  finishRead();
  await vi.waitFor(() => expect(mocks.resolve).toHaveBeenCalledOnce());
  expect(mocks.release).not.toHaveBeenCalled();
  finishReply();
  await vi.waitFor(() => expect(mocks.release).toHaveBeenCalledWith(loan));
  expect(mocks.validate).toHaveBeenCalledOnce();
  expect(mocks.configure).toHaveBeenCalledOnce();
  expect(mocks.release).toHaveBeenCalledOnce();
});

it('retains a validated loan until the close rejection reply settles', async () => {
  let validate!: (value: { valid: true }) => void;
  let reply!: () => void;
  mocks.validate.mockReturnValueOnce(new Promise((resolve) => { validate = resolve; }));
  mocks.resolve.mockReturnValueOnce(new Promise<void>((resolve) => { reply = resolve; }));
  mocks.listener?.({ operation: 'read_framed_outbound_fact', request_id: 'closed', payload: { payload_loan: loan } });
  const budget = await import('../runtime/companionFramedPayloadBudget');
  await budget.closeCompanionFramedPayloadBudget(owner);
  validate({ valid: true });
  await vi.waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith({
    request_id: 'closed', error: 'framed_sync_payload_loan_invalid'
  }));
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.release).not.toHaveBeenCalled();
  reply();
  await vi.waitFor(() => expect(mocks.release).toHaveBeenCalledWith(loan));
});

it('retains the producer loan until a production failure reply settles', async () => {
  let reply!: () => void;
  mocks.fact.mockRejectedValueOnce(new Error('fact unavailable'));
  mocks.resolve.mockReturnValueOnce(new Promise<void>((resolve) => { reply = resolve; }));
  mocks.listener?.({ operation: 'read_framed_outbound_fact', request_id: 'failed', payload: { payload_loan: loan } });
  await vi.waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith({
    request_id: 'failed', error: 'fact unavailable'
  }));
  expect(mocks.release).not.toHaveBeenCalled();
  reply();
  await vi.waitFor(() => expect(mocks.release).toHaveBeenCalledWith(loan));
});
