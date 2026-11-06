// @vitest-environment jsdom
import path from 'node:path';

import { act, fireEvent, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ nativeTheme: { themeSource: 'system', on: vi.fn() },
  systemPreferences: { subscribeNotification: vi.fn() }, BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: transport.root,
  app_cache_dir: `${transport.root}/cache`, app_config_dir: `${transport.root}/config`, app_log_dir: `${transport.root}/logs` }) }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('../ipc/boot.js', () => ({ appendBootEvent: vi.fn(async () => undefined) }));
vi.mock('../ipc/workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));
vi.mock('../../src/shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () =>
  (command: string, args: Record<string, unknown> = {}) => invoke(command, structuredClone(args)) }));

import { hasContentEditingSession } from '../../lib/core/sync/contentEditingSession.js';
import { loadLibraryPathSettings, updateLibraryPathSetting } from '../ipc/libraryPaths.js';
import { handleNodeMutationCommand } from '../ipc/storageNodeMutationCommands.js';
import { handleReadingAndReviewCommand, handleWorkspaceReadCommand } from '../ipc/storageReadCommands.js';

import { currentLibraryScope } from './attachmentResourceDescription.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from './connection.js';
import { createEditorHandoffFixture, invokeEditorHandoff, observeReceiptWaiting,
  setupEditorHandoffTests, transport } from './editorHandoff.test-support.js';

const rendererModule = (modulePath: string) => import(modulePath);
const { drainPendingNodeContentRuntimePersists } = await rendererModule('../../src/store/workspaceStoreContentRuntimePersist.ts');
const { runWorkspaceContentCommand } = await rendererModule('../../src/store/workspaceContentCommands.ts');
const { useAppRuntime } = await rendererModule('../../src/app/hooks/useAppRuntime.ts');
const { updateRuntimeLibraryPathSetting } = await rendererModule('../../src/shared/platform/libraryPathsRuntimeRepository.ts');

let switchRequests = 0;
async function invoke(command: string, args: Record<string, unknown>) {
  if (command === 'select_import_directory') return path.join(transport.root, 'Next');
  if (command === 'load_library_path_settings') return loadLibraryPathSettings();
  if (command === 'load_workspace_list_snapshot' || command === 'load_reading_progress') {
    return runWithDatabaseConnectionOwner<unknown>(() => handleWorkspaceReadCommand(command, args)
      ?? handleReadingAndReviewCommand(command, args));
  }
  if (command === 'append_reading_position_trace_log' || command === 'boot_report') return null;
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

async function fixture(renderEditor?: Parameters<typeof createEditorHandoffFixture>[2]) {
  vi.useRealTimers();
  switchRequests = 0;
  const runtime = renderHook(() => useAppRuntime(320, 360));
  const app = await createEditorHandoffFixture(true, true, renderEditor, () => ({
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


it.each([false, true])('waits for an accepted text command at the registered close boundary (failure: %s)', async failed => {
  const app = await fixture();
  await act(async () => { app.input('Before command'); expect(await app.drain()).toBe(true); });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let command!: Promise<boolean>;
  let closing!: Promise<boolean>;
  let closeCompleted = false;
  await act(async () => {
    command = runWorkspaceContentCommand(async () => {
      await gate;
      if (failed) return false;
      expect(await app.flush()).toBe(true);
      app.input('Accepted command tail');
      return app.drain();
    });
    closing = flushWindow.__folioleFlushPendingEditorDraftBeforeClose!().then(result => {
      closeCompleted = true;
      return result;
    });
    await Promise.resolve();
  });
  expect(closeCompleted).toBe(false);
  await act(async () => { release(); await command; expect(await closing).toBe(!failed); });
  if (failed) {
    await act(async () => { app.input('Continued after command failure'); expect(await app.drain()).toBe(true); });
    await act(async () => { expect(await flushWindow.__folioleFlushPendingEditorDraftBeforeClose!()).toBe(true); });
  }
  expect(switchRequests).toBe(0);
  expect(openDatabaseConnection().sqlite.prepare("SELECT content FROM nodes WHERE id = 'topic'").pluck().get())
    .toBe(failed ? 'Continued after command failure' : 'Accepted command tail');
});


const { MarkdownEditor } = await rendererModule('../../src/features/editor/components/MarkdownEditor.tsx');
const { LocalizationProvider } = await rendererModule('../../src/shared/localization/LocalizationProvider.tsx');
const { MouseGestureSettingsProvider } = await rendererModule('../../src/features/settings/context/MouseGestureSettingsProvider.tsx');
type CompositionEditor = { getContent(): string; replaceRange(from: number, to: number, content: string): void;
  flushContentChanges?(): void };

it.each([false, true])('keeps ordinary saves independent and waits for composition at close (modified: %s)', async modified => {
  let adapter: CompositionEditor | null = null;
  const app = await fixture(panel => createElement(LocalizationProvider, null,
    createElement(MouseGestureSettingsProvider, null, createElement(MarkdownEditor, {
      nodeId: panel.editorNodeId, value: panel.editorContent, onChange: panel.onEditorChange,
      onDocumentInput: panel.onEditorInput, onPendingInput: panel.onEditorPendingInput,
      onFocusCapture: panel.onEditorFocus, onFocusLeave: panel.onEditorFocusLeave,
      onReady: (next: CompositionEditor | null) => { adapter = next; }
    }))));
  const editor = adapter as unknown as CompositionEditor;
  const input = app.container!.querySelector<HTMLElement>('.cm-content')!;
  await act(async () => {
    input.focus();
    fireEvent.compositionStart(input);
    if (modified) {
      editor.replaceRange(0, editor.getContent().length, 'Intermediate 中');
      editor.flushContentChanges?.();
      expect(await app.drain()).toBe(true);
    }
  });
  let ordinaryCompleted = false;
  const ordinary = app.flush().then((result: boolean) => { ordinaryCompleted = true; return result; });
  try {
    await act(async () => { await vi.waitFor(() => expect(ordinaryCompleted).toBe(true)); });
  } finally {
    if (!ordinaryCompleted) await act(async () => { fireEvent.compositionEnd(input); await ordinary; });
  }
  expect(await ordinary).toBe(true);
  let closing!: Promise<boolean>;
  let closeCompleted = false;
  await act(async () => {
    closing = flushWindow.__folioleFlushPendingEditorDraftBeforeClose!().then(result => {
      closeCompleted = true;
      return result;
    });
    await Promise.resolve();
  });
  expect(closeCompleted).toBe(false);
  await act(async () => {
    editor.replaceRange(0, editor.getContent().length, 'Final 中文');
    editor.flushContentChanges?.();
    fireEvent.compositionEnd(input);
    expect(await closing).toBe(true);
  });
  expect(switchRequests).toBe(0);
  expect(openDatabaseConnection().sqlite.prepare("SELECT content FROM nodes WHERE id = 'topic'").pluck().get())
    .toBe('Final 中文');
});


const { useLibraryPathSettings } = await rendererModule('../../src/features/settings/components/useLibraryPathSettings.ts');

it('starts a new editing session after leaving the editor and moving its library', async () => {
  const app = await fixture();
  await act(async () => { app.input('Before settings'); expect(await app.drain()).toBe(true); });
  await act(async () => { await app.view.result.current.onEditorFocusLeave?.(); });
  expect(hasContentEditingSession(app.port, 'topic')).toBe(false);
  const settings = renderHook(() => useLibraryPathSettings(), {
    wrapper: ({ children }) => createElement(LocalizationProvider, null, children)
  });
  await act(async () => { await settings.result.current.onChangeLocation('library_home'); });
  expect(settings.result.current.errorByLocation.library_home).toBeNull();
  expect(app.store.getState().libraryScope).toBe(currentLibraryScope());
  await act(async () => { app.input('New input after settings'); expect(await app.drain()).toBe(true); });
  expect(hasContentEditingSession(createBetterSqliteDbPort(openDatabaseConnection().sqlite), 'topic')).toBe(true);
  expect(openDatabaseConnection().sqlite.prepare("SELECT content FROM nodes WHERE id = 'topic'").pluck().get())
    .toBe('New input after settings');
});
