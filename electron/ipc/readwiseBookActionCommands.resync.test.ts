// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadState: vi.fn(),
  loadPdfState: vi.fn(),
  getPdf: vi.fn(),
  notify: vi.fn(),
  resync: vi.fn()
}));

vi.mock('../import/readwiseBookImportReset.js', () => ({ resetReadwiseBookImport: vi.fn() }));
vi.mock('../import/readwiseBookManualActions.js', () => ({
  loadReadwiseBookEpub: vi.fn(), openReadwiseBookDownload: vi.fn()
}));
vi.mock('../import/readwiseOriginalEpubAction.js', () => ({
  loadReadwiseOriginalEpubActionState: vi.fn(), useReadwiseOriginalEpub: vi.fn()
}));
vi.mock('../import/readwisePdfOriginalAction.js', () => ({
  getReadwisePdfOriginal: mocks.getPdf,
  loadReadwisePdfOriginalActionState: mocks.loadPdfState
}));
vi.mock('../import/readwiseSourceResyncAction.js', () => ({
  loadReadwiseSourceResyncActionState: mocks.loadState,
  resyncReadwiseSource: mocks.resync
}));
vi.mock('./workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: mocks.notify }));

import { handleReadwiseBookActionCommand } from './readwiseBookActionCommands.js';

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.loadState.mockReturnValue({
    body_authority: 'reader_html', category: 'article', node_id: 'source', status: 'ready'
  });
  mocks.resync.mockResolvedValue({ node_id: 'source', status: 'completed' });
  mocks.loadPdfState.mockReturnValue({ node_id: 'source', status: 'ready' });
  mocks.getPdf.mockResolvedValue({ node_id: 'source', status: 'completed' });
});

it('routes PDF original commands and refreshes only after a saved original', async () => {
  await expect(handleReadwiseBookActionCommand({
    command: 'load_readwise_pdf_original_action_state', args: { node_id: 'source' }
  }, { node_id: 'source' }, null)).resolves.toMatchObject({ status: 'ready' });
  expect(mocks.loadPdfState).toHaveBeenCalledWith('source');
  expect(mocks.notify).not.toHaveBeenCalled();
  await expect(handleReadwiseBookActionCommand({
    command: 'get_readwise_pdf_original', args: { node_id: 'source' }
  }, { node_id: 'source' }, null)).resolves.toMatchObject({ status: 'completed' });
  expect(mocks.notify).toHaveBeenCalledTimes(1);
  mocks.getPdf.mockResolvedValue({ node_id: 'source', status: 'failed' });
  await handleReadwiseBookActionCommand({
    command: 'get_readwise_pdf_original', args: { node_id: 'source' }
  }, { node_id: 'source' }, null);
  expect(mocks.notify).toHaveBeenCalledTimes(1);
});

it('routes source state without notifying a workspace change', async () => {
  await expect(handleReadwiseBookActionCommand({
    command: 'load_readwise_source_resync_action_state', args: { node_id: 'source' }
  }, { node_id: 'source' }, null)).resolves.toMatchObject({ status: 'ready' });
  expect(mocks.loadState).toHaveBeenCalledWith('source');
  expect(mocks.notify).not.toHaveBeenCalled();
});

it('routes resync and refreshes the workspace only after completion', async () => {
  await expect(handleReadwiseBookActionCommand({
    command: 'resync_readwise_source', args: { node_id: 'source' }
  }, { node_id: 'source' }, null)).resolves.toMatchObject({ status: 'completed' });
  expect(mocks.resync).toHaveBeenCalledWith('source');
  expect(mocks.notify).toHaveBeenCalledTimes(1);

  mocks.resync.mockResolvedValue({ node_id: 'source', status: 'failed' });
  await handleReadwiseBookActionCommand({
    command: 'resync_readwise_source', args: { node_id: 'source' }
  }, { node_id: 'source' }, null);
  expect(mocks.notify).toHaveBeenCalledTimes(1);
});
