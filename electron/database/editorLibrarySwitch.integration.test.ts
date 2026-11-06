// @vitest-environment jsdom
import path from 'node:path';

import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ nativeTheme: { themeSource: 'system', on: vi.fn() },
  systemPreferences: { subscribeNotification: vi.fn() }, BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: transport.root,
  app_cache_dir: `${transport.root}/cache`, app_config_dir: `${transport.root}/config`, app_log_dir: `${transport.root}/logs` }) }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('../ipc/workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));
vi.mock('../../src/shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () =>
  (command: string, args: Record<string, unknown> = {}) => invoke(command, structuredClone(args)) }));

import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';
import { handleNodeMutationCommand } from '../ipc/storageNodeMutationCommands.js';

import { openDatabaseConnection } from './connection.js';
import { createEditorHandoffFixture, invokeEditorHandoff, observeReceiptWaiting,
  setupEditorHandoffTests, transport } from './editorHandoff.test-support.js';

const rendererModule = (modulePath: string) => import(modulePath);
const { drainPendingNodeContentRuntimePersists } = await rendererModule('../../src/store/workspaceStoreContentRuntimePersist.ts');
const { runWorkspaceContentCommand } = await rendererModule('../../src/store/workspaceContentCommands.ts');
const { useAppRuntime } = await rendererModule('../../src/app/hooks/useAppRuntime.ts');
const { updateRuntimeLibraryPathSetting } = await rendererModule('../../src/shared/platform/libraryPathsRuntimeRepository.ts');

let switchRequests = 0;
async function invoke(command: string, args: Record<string, unknown>) {
  if (command === 'update_library_path_setting') {
    switchRequests += 1;
    return updateLibraryPathSetting({ location: 'library_home', path: String(args.path) });
  }
  if (command === 'flush_dirty_node_sync_versions') return handleNodeMutationCommand(command, args);
  return invokeEditorHandoff(command, args);
}

const flushWindow = window as Window & { __folioleFlushPendingEditorDraftBeforeClose?: () => Promise<boolean> };
setupEditorHandoffTests();
afterEach(() => { delete flushWindow.__folioleFlushPendingEditorDraftBeforeClose; });

async function fixture() {
  vi.useRealTimers();
  switchRequests = 0;
  const runtime = renderHook(() => useAppRuntime(320, 360));
  const app = await createEditorHandoffFixture(true, true, undefined, () => ({
    onRegisterEditorDraftFlush: runtime.result.current.registerPendingEditorDraftFlush
  }));
  flushWindow.__folioleFlushPendingEditorDraftBeforeClose = runtime.result.current.flushPendingEditorDraftBeforeClose;
  return { ...app, flush: runtime.result.current.flushPendingEditorDraftImmediately, drain: async () => {
    runtime.result.current.flushPendingEditorDraft();
    return drainPendingNodeContentRuntimePersists();
  } };
}

it('waits for the current save receipt and pending tail before changing Library Home', async () => {
  const app = await fixture();
  const originalPath = openDatabaseConnection().dbPath;
  let release!: () => void;
  transport.receiptGate = new Promise(resolve => { release = resolve; });
  const reached = new Promise<void>(resolve => observeReceiptWaiting(resolve));
  let saving!: Promise<boolean>;
  act(() => { app.input('Saved before switch'); saving = app.drain(); });
  await act(async () => { await reached; });
  act(() => app.input('Saved before switch with tail'));
  let switching!: Promise<unknown>;
  await act(async () => {
    switching = updateRuntimeLibraryPathSetting('library_home', path.join(transport.root, 'Next'));
    await Promise.resolve();
  });
  const switchedBeforeReceipt = switchRequests > 0 || openDatabaseConnection().dbPath !== originalPath;
  await act(async () => { release(); await saving; await switching; });
  expect(switchedBeforeReceipt).toBe(false);
  expect(openDatabaseConnection().sqlite.prepare("SELECT content FROM nodes WHERE id = 'topic'").pluck().get())
    .toBe('Saved before switch with tail');
  delete flushWindow.__folioleFlushPendingEditorDraftBeforeClose;
});

it('keeps the current library and accepts continued input when the switch flush fails', async () => {
  const app = await fixture();
  const originalPath = openDatabaseConnection().dbPath;
  transport.failSave = true;
  act(() => app.input('Unsaved before switch'));
  let failure: unknown;
  await act(async () => {
    try { await updateRuntimeLibraryPathSetting('library_home', path.join(transport.root, 'Next')); }
    catch (error) { failure = error; }
  });
  expect(failure).toBeInstanceOf(Error);
  expect(openDatabaseConnection().dbPath).toBe(originalPath);
  await act(async () => { app.input('Continued after failure'); expect(await app.drain()).toBe(true); });
  expect(app.view.result.current.editorContent).toBe('Continued after failure');
  await act(async () => { await updateRuntimeLibraryPathSetting('library_home', path.join(transport.root, 'Next')); });
  expect(openDatabaseConnection().sqlite.prepare("SELECT content FROM nodes WHERE id = 'topic'").pluck().get())
    .toBe('Continued after failure');
  delete flushWindow.__folioleFlushPendingEditorDraftBeforeClose;
});


it.each([false, true])('waits for an accepted text command before switching library (failure: %s)', async failed => {
  const app = await fixture();
  const originalPath = openDatabaseConnection().dbPath;
  await act(async () => { app.input('Before command'); expect(await app.drain()).toBe(true); });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let command!: Promise<boolean>;
  let switching!: Promise<unknown>;
  let failure: unknown;
  await act(async () => {
    command = runWorkspaceContentCommand(async () => {
      await gate;
      if (failed) return false;
      expect(await app.flush()).toBe(true);
      app.input('Accepted command tail');
      return app.drain();
    });
    switching = updateRuntimeLibraryPathSetting('library_home', path.join(transport.root, 'Next'))
      .catch((error: unknown) => { failure = error; });
    await new Promise(resolve => setTimeout(resolve, 20));
  });
  const switchedBeforeCommand = switchRequests > 0 || openDatabaseConnection().dbPath !== originalPath;
  await act(async () => { release(); await command; await switching; });
  expect(switchedBeforeCommand).toBe(false);
  if (failed) {
    expect(failure).toBeInstanceOf(Error);
    expect(openDatabaseConnection().dbPath).toBe(originalPath);
    await act(async () => { app.input('Continued after command failure'); expect(await app.drain()).toBe(true); });
    await act(async () => { await updateRuntimeLibraryPathSetting('library_home', path.join(transport.root, 'Next')); });
  } else expect(failure).toBeUndefined();
  expect(openDatabaseConnection().sqlite.prepare("SELECT content FROM nodes WHERE id = 'topic'").pluck().get())
    .toBe(failed ? 'Continued after command failure' : 'Accepted command tail');
});
