// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadState: vi.fn(),
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
