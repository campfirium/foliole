// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  commit: vi.fn(),
  loadTarget: vi.fn(),
  prepare: vi.fn(),
  placePdf: vi.fn(),
  runtimeStatus: vi.fn(),
  ownerActive: false,
  owner: vi.fn(async (execute: () => unknown) => {
    mocks.ownerActive = true;
    try { return await execute(); } finally { mocks.ownerActive = false; }
  })
}));

vi.mock('../database/connection.js', () => ({ runWithDatabaseConnectionOwner: mocks.owner }));
vi.mock('./readwiseSourceResyncCommit.js', () => ({ commitReadwiseSourceResync: mocks.commit }));
vi.mock('./readwiseSourceResyncPreparation.js', () => ({ prepareReadwiseSourceResync: mocks.prepare }));
vi.mock('./readwisePdfPlacement.js', () => ({ placeReadwisePdfHighlightsFromAttachment: mocks.placePdf }));
vi.mock('./readwiseSourceResyncTarget.js', () => ({
  captureReadwiseSourceResyncSnapshot: mocks.capture,
  loadReadwiseSourceResyncTarget: mocks.loadTarget,
  readReadwiseSourceResyncRuntimeStatus: mocks.runtimeStatus
}));

import { beginReadwiseSourceOperation, finishReadwiseSourceOperation } from './readwiseSourceOperationLock.js';
import { loadReadwiseSourceResyncActionState, resyncReadwiseSource } from './readwiseSourceResyncAction.js';

const target = {
  connectionRef: 'connection', documentId: 'document', nodeId: 'source', sourceFingerprint: 'fingerprint',
  state: { bodyAuthority: 'reader_html', metadata: { category: 'article' } }, title: 'Source'
};

beforeEach(() => {
  Object.values(mocks).forEach((mock) => {
    if (vi.isMockFunction(mock)) mock.mockClear();
  });
  mocks.ownerActive = false;
  mocks.owner.mockImplementation(async (execute: () => unknown) => {
    mocks.ownerActive = true;
    try { return await execute(); } finally { mocks.ownerActive = false; }
  });
  mocks.loadTarget.mockReturnValue(target);
  mocks.runtimeStatus.mockReturnValue('ready');
  mocks.capture.mockReturnValue('snapshot');
  mocks.prepare.mockResolvedValue({ document: { id: 'document' } });
  mocks.placePdf.mockResolvedValue(undefined);
  mocks.commit.mockImplementation(() => undefined);
});

it('places highlights again after resyncing a PDF that already has a local original', async () => {
  mocks.loadTarget.mockReturnValue({ ...target, state: {
    bodyAuthority: 'reader_html', metadata: { category: 'pdf' },
    originalFile: { attachmentId: 'original', status: 'localized' }
  } });
  mocks.prepare.mockResolvedValue({ document: { category: 'pdf', id: 'document' } });
  await expect(resyncReadwiseSource('source')).resolves.toMatchObject({ status: 'completed' });
  expect(mocks.placePdf).toHaveBeenCalledWith({
    attachmentId: 'original', connectionRef: 'connection', documentId: 'document', nodeId: 'source'
  });
});

it('reports persisted source facts and runtime eligibility', () => {
  expect(loadReadwiseSourceResyncActionState('source')).toEqual({
    body_authority: 'reader_html', category: 'article', node_id: 'source', status: 'ready'
  });
  mocks.runtimeStatus.mockReturnValue('reconnect_required');
  expect(loadReadwiseSourceResyncActionState('source')).toMatchObject({ status: 'reconnect_required' });
});

it('requests and commits a fresh candidate on every completed execution', async () => {
  await expect(resyncReadwiseSource('source', { minIntervalMs: 0 })).resolves.toMatchObject({ status: 'completed' });
  await expect(resyncReadwiseSource('source', { minIntervalMs: 0 })).resolves.toMatchObject({ status: 'completed' });

  expect(mocks.prepare).toHaveBeenCalledTimes(2);
  expect(mocks.commit).toHaveBeenCalledTimes(2);
  expect(mocks.commit).toHaveBeenNthCalledWith(1, expect.objectContaining({ expectedSnapshot: 'snapshot', target }));
});

it('commits under the database owner after preparation completes', async () => {
  mocks.commit.mockImplementation(() => {
    if (!mocks.ownerActive) throw new Error('sqlite connection is owned by another asynchronous transaction');
  });
  await expect(resyncReadwiseSource('source')).resolves.toMatchObject({ status: 'completed' });
  expect(mocks.commit).toHaveBeenCalledTimes(1);
});

it('waits for a busy database owner before reading the target', async () => {
  let release!: () => void;
  const busy = new Promise<void>((resolve) => { release = resolve; });
  mocks.owner.mockImplementationOnce(async (execute: () => unknown) => {
    await busy;
    mocks.ownerActive = true;
    try { return await execute(); } finally { mocks.ownerActive = false; }
  });
  const result = resyncReadwiseSource('source');
  await Promise.resolve();
  expect(mocks.loadTarget).not.toHaveBeenCalled();
  expect(mocks.prepare).not.toHaveBeenCalled();
  release();
  await expect(result).resolves.toMatchObject({ status: 'completed' });
});

it('rejects a second request while the same source is being prepared', async () => {
  let release!: () => void;
  mocks.prepare.mockImplementation(() => new Promise((resolve) => {
    release = () => resolve({ document: { id: 'document' } });
  }));
  const first = resyncReadwiseSource('source');
  await vi.waitFor(() => expect(loadReadwiseSourceResyncActionState('source')).toMatchObject({ status: 'running' }));
  await expect(resyncReadwiseSource('source')).resolves.toMatchObject({ status: 'source_inactive' });
  release();
  await expect(first).resolves.toMatchObject({ status: 'completed' });
  expect(mocks.prepare).toHaveBeenCalledTimes(1);
});

it('rejects execution while another Readwise action owns the source', async () => {
  expect(beginReadwiseSourceOperation('source')).toBe(true);
  try {
    expect(loadReadwiseSourceResyncActionState('source')).toMatchObject({ status: 'running' });
    await expect(resyncReadwiseSource('source')).resolves.toMatchObject({ status: 'source_inactive' });
  } finally {
    finishReadwiseSourceOperation('source');
  }
  expect(mocks.prepare).not.toHaveBeenCalled();
});

it('does not commit when preparation fails', async () => {
  mocks.prepare.mockRejectedValue(new Error('readwise_resync_body_unavailable'));
  await expect(resyncReadwiseSource('source')).resolves.toMatchObject({
    error_code: 'readwise_resync_body_unavailable', status: 'failed'
  });
  expect(mocks.commit).not.toHaveBeenCalled();
});
