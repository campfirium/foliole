// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { createDefaultImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';

const state = vi.hoisted(() => ({
  busy: false,
  release: null as null | (() => void),
  run: vi.fn(async () => undefined)
}));

vi.mock('../database/connection.js', () => ({
  async runWithDatabaseConnectionOwner<T>(execute: () => Promise<T> | T) {
    if (state.busy) await new Promise<void>((resolve) => { state.release = resolve; });
    return execute();
  }
}));
vi.mock('../database/readwiseHostAssignment.js', () => ({ canCurrentHostRunReadwise: () => true }));
vi.mock('../database/watchedFolderBindings.js', () => ({
  resolveExecutableWatchedBinding: () => ({ bindingId: 'watched-test', executable: true })
}));
vi.mock('../managedPathSafety.js', () => ({ loadManagedPathCandidates: () => [] }));
vi.mock('./keepImportService.js', () => ({
  runKeepImportRule: async () => {
    if (state.busy) await new Promise<void>((resolve) => { state.release = resolve; });
    return state.run();
  }
}));
vi.mock('./keepImportWatch.js', () => ({ watchKeepImportDirectory: () => ({ close() {} }) }));
vi.mock('./importManagerSettings.js', () => ({
  loadImportManagerSettings: () => ({
    ...createDefaultImportManagerSettings(),
    sources: [{
      actionMode: 'keep', archivePath: '', highlightMode: 'merged', highlightPath: '',
      id: 'watched-test', keepPreview: null, keepState: 'enabled', primaryPath: '/tmp/watched-test'
    }]
  })
}));
vi.mock('./importMonitorTaskScheduler.js', () => ({
  submitImportMonitorTask: ({ run }: { run: () => Promise<unknown> }) => {
    void run();
    return { promise: Promise.resolve() };
  }
}));

import { startKeepImportMonitor, stopKeepImportMonitor } from './keepImportMonitorRuntime.js';

it('waits for a competing database owner before importing a watched file', async () => {
  state.run.mockClear();
  await startKeepImportMonitor();
  state.busy = true;
  try {
    await vi.waitFor(() => expect(state.release).not.toBeNull());
    expect(state.run).not.toHaveBeenCalled();
    state.busy = false;
    state.release?.();
    await vi.waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
  } finally {
    state.busy = false;
    state.release?.();
    stopKeepImportMonitor();
  }
});
