// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isDestroyed: vi.fn(() => false),
  markWorkspaceSearchSidecarRebuilding: vi.fn(),
  openDatabaseConnection: vi.fn(),
  readWorkspaceSearchSidecarRebuildStatus: vi.fn(),
  rebuildExternalSearchCacheStrategy: vi.fn(),
  runWorkspaceSearchRebuildInWorker: vi.fn(),
  send: vi.fn(),
  submitDesktopTask: vi.fn()
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

vi.mock('../database/externalSearchCacheDatabase.js', () => ({
  rebuildExternalSearchCacheStrategy: mocks.rebuildExternalSearchCacheStrategy
}));

vi.mock('../desktopTaskScheduler.js', () => ({
  desktopTaskScheduler: {
    submit: mocks.submitDesktopTask
  }
}));

vi.mock('../../lib/core/database/workspaceSearchSidecar.js', () => ({
  markWorkspaceSearchSidecarRebuilding: mocks.markWorkspaceSearchSidecarRebuilding,
  readWorkspaceSearchSidecarRebuildStatus: mocks.readWorkspaceSearchSidecarRebuildStatus
}));

vi.mock('./searchIndexRebuildWorkerClient.js', () => ({
  runWorkspaceSearchRebuildInWorker: mocks.runWorkspaceSearchRebuildInWorker
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
  mocks.runWorkspaceSearchRebuildInWorker.mockImplementation(async (strategy: string) => ({
    status: 'ready',
    strategy,
    tokenizer: strategy === 'cjk-trigram' ? 'trigram' : 'unicode61'
  }));
  mocks.rebuildExternalSearchCacheStrategy.mockImplementation((strategy: string) => ({
    status: 'ready',
    strategy,
    tokenizer: strategy === 'cjk-trigram' ? 'trigram' : 'unicode61'
  }));
  mocks.submitDesktopTask.mockImplementation((definition) => {
    const promise = Promise.resolve(definition.run({
      hasHigherPriorityPending: () => false,
      logger: { error: vi.fn(), info: vi.fn() },
      progress: vi.fn(),
      signal: new AbortController().signal,
      yieldIfNeeded: async () => undefined
    }));
    return {
      cancel: vi.fn(),
      id: definition.id,
      promise
    };
  });
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
  expect(mocks.submitDesktopTask).not.toHaveBeenCalled();
  expect(mocks.runWorkspaceSearchRebuildInWorker).not.toHaveBeenCalled();
});

it('coalesces quick rebuild requests so only the last strategy is rebuilt', async () => {
  requestSearchIndexRebuild('cjk-trigram');
  requestSearchIndexRebuild('word-based');

  await new Promise((resolve) => setImmediate(resolve));
  await Promise.resolve();

  expect(mocks.submitDesktopTask).toHaveBeenCalledWith(expect.objectContaining({
    concurrencyKey: 'search-index-rebuild',
    runOn: 'utility',
    source: 'search-index-rebuild'
  }));
  expect(mocks.runWorkspaceSearchRebuildInWorker).toHaveBeenCalledTimes(1);
  expect(mocks.runWorkspaceSearchRebuildInWorker).toHaveBeenCalledWith('word-based');
  expect(mocks.rebuildExternalSearchCacheStrategy).toHaveBeenCalledWith('word-based');
  expect(mocks.send).toHaveBeenLastCalledWith('foliole:search-index-rebuild-status', {
    status: 'ready',
    strategy: 'word-based'
  });
});

it('reports a failed rebuild when the external sidecar cannot rebuild', async () => {
  mocks.rebuildExternalSearchCacheStrategy.mockReturnValue({
    error: 'external boom',
    status: 'failed',
    strategy: 'cjk-trigram',
    tokenizer: 'trigram'
  });

  requestSearchIndexRebuild('cjk-trigram');
  await new Promise((resolve) => setImmediate(resolve));
  await Promise.resolve();

  expect(mocks.send).toHaveBeenLastCalledWith('foliole:search-index-rebuild-status', {
    error: 'external boom',
    status: 'failed',
    strategy: 'cjk-trigram'
  });
});
