// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isDestroyed: vi.fn(() => false),
  markWorkspaceSearchSidecarRebuilding: vi.fn(),
  openDatabaseConnection: vi.fn(),
  readWorkspaceSearchSidecarRebuildStatus: vi.fn(),
  rebuildWorkspaceSearchSidecar: vi.fn(),
  send: vi.fn()
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [{
      isDestroyed: mocks.isDestroyed,
      webContents: { send: mocks.send }
    }]
  }
}));

vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: mocks.openDatabaseConnection
}));

vi.mock('../../lib/core/database/workspaceSearchSidecar.js', () => ({
  markWorkspaceSearchSidecarRebuilding: mocks.markWorkspaceSearchSidecarRebuilding,
  readWorkspaceSearchSidecarRebuildStatus: mocks.readWorkspaceSearchSidecarRebuildStatus,
  rebuildWorkspaceSearchSidecar: mocks.rebuildWorkspaceSearchSidecar
}));

import {
  asFullTextSearchIndexStrategy,
  loadSearchIndexRebuildStatus,
  requestSearchIndexRebuild,
  resetSearchIndexRebuildRuntimeForTests
} from './searchIndexRebuild.js';

const connection = { sqlite: {} };

beforeEach(() => {
  vi.clearAllMocks();
  resetSearchIndexRebuildRuntimeForTests();
  mocks.openDatabaseConnection.mockReturnValue(connection);
  mocks.markWorkspaceSearchSidecarRebuilding.mockImplementation((_connection, strategy: string) => ({
    status: 'rebuilding',
    strategy,
    tokenizer: strategy === 'cjk-trigram' ? 'trigram' : 'unicode61'
  }));
  mocks.rebuildWorkspaceSearchSidecar.mockImplementation((_connection, { strategy }: { strategy: string }) => ({
    status: 'ready',
    strategy,
    tokenizer: strategy === 'cjk-trigram' ? 'trigram' : 'unicode61'
  }));
});

it('rejects invalid search index strategies', () => {
  expect(() => asFullTextSearchIndexStrategy('trigram')).toThrow('invalid search index strategy');
});

it('loads persisted search rebuild status without exposing tokenizer', () => {
  mocks.readWorkspaceSearchSidecarRebuildStatus.mockReturnValue({
    status: 'failed',
    strategy: 'cjk-trigram',
    tokenizer: 'trigram',
    error: 'boom'
  });

  expect(loadSearchIndexRebuildStatus()).toEqual({
    error: 'boom',
    status: 'failed',
    strategy: 'cjk-trigram'
  });
});

it('persists and broadcasts rebuilding before async rebuild work drains', () => {
  expect(requestSearchIndexRebuild('cjk-trigram')).toEqual({
    status: 'rebuilding',
    strategy: 'cjk-trigram'
  });

  expect(mocks.markWorkspaceSearchSidecarRebuilding).toHaveBeenCalledWith(connection, 'cjk-trigram');
  expect(mocks.send).toHaveBeenCalledWith('foliole:search-index-rebuild-status', {
    status: 'rebuilding',
    strategy: 'cjk-trigram'
  });
  expect(mocks.rebuildWorkspaceSearchSidecar).not.toHaveBeenCalled();
});

it('coalesces quick rebuild requests so only the last strategy is rebuilt', async () => {
  requestSearchIndexRebuild('cjk-trigram');
  requestSearchIndexRebuild('word-based');

  await new Promise((resolve) => setImmediate(resolve));

  expect(mocks.rebuildWorkspaceSearchSidecar).toHaveBeenCalledTimes(1);
  expect(mocks.rebuildWorkspaceSearchSidecar).toHaveBeenCalledWith(connection, { strategy: 'word-based' });
  expect(mocks.send).toHaveBeenLastCalledWith('foliole:search-index-rebuild-status', {
    status: 'ready',
    strategy: 'word-based'
  });
});
