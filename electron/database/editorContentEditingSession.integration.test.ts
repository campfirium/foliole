// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: transport.root,
  app_cache_dir: `${transport.root}/cache`, app_config_dir: `${transport.root}/config`, app_log_dir: `${transport.root}/logs` }) }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('../ipc/workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));
vi.mock('../../src/shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () =>
  (command: string, args: Record<string, unknown>) => invokeEditorHandoff(command, structuredClone(args)) }));

import { hasContentEditingSession } from '../../lib/core/sync/contentEditingSession.js';

import { createEditorHandoffFixture, invokeEditorHandoff, observeReceiptWaiting,
  setupEditorHandoffTests, transport } from './editorHandoff.test-support.js';

setupEditorHandoffTests();

it('keeps an explicit exit retryable after persistence fails', async () => {
  const app = await createEditorHandoffFixture(true, true);
  await act(async () => { app.input('Before exit'); expect(await app.drain()).toBe(true); });
  await act(async () => { await app.remote(); });
  transport.failSave = true;
  await act(async () => { app.input('Retry exit tail'); expect(await app.drain()).toBe(false); });
  expect(hasContentEditingSession(app.port, 'topic')).toBe(true);
  await act(async () => { app.view.result.current.onExitEditorFocus(); await app.drain(); });
  expect(hasContentEditingSession(app.port, 'topic')).toBe(false);
  expect((await app.current()).parent_version_ids).toHaveLength(2);
  expect(await app.bodies()).toContain('Retry exit tail');
});

it('does not claim an unmodified editor when it receives focus', async () => {
  const app = await createEditorHandoffFixture(true, true);
  act(() => { app.view.result.current.onEditorFocus(); });
  expect(hasContentEditingSession(app.port, 'topic')).toBe(false);
  await act(async () => { await app.remote(); });
  expect((await app.current()).body_text).toBe('Remote');
  await act(async () => { app.view.result.current.onExitEditorFocus(); await app.drain(); });
  expect((await app.current()).version_id).toBe('remote');
});

it('settles an explicit editor exit only after buffered tail input is durably saved', async () => {
  const app = await createEditorHandoffFixture(true, true);
  await act(async () => { app.input('Before exit'); expect(await app.drain()).toBe(true); });
  await act(async () => { await app.remote(); });
  act(() => { app.input('Before exit tail', false); app.view.result.current.onExitEditorFocus(); });
  expect(hasContentEditingSession(app.port, 'topic')).toBe(true);
  expect((await app.current()).parent_version_ids).toHaveLength(1);
  await act(async () => { app.view.result.current.handleEditorChange('Before exit tail'); await app.drain(); });
  expect(hasContentEditingSession(app.port, 'topic')).toBe(false);
  expect((await app.current()).parent_version_ids).toHaveLength(2);
  expect(await app.bodies()).toContain('Before exit tail');
});

it('keeps editing after refocusing during an exit receipt without requiring another keystroke', async () => {
  const app = await createEditorHandoffFixture(true, true);
  await act(async () => { app.input('Before exit'); expect(await app.drain()).toBe(true); });
  await act(async () => { await app.remote(); });
  let release!: () => void;
  transport.receiptGate = new Promise(resolve => { release = resolve; });
  const reached = new Promise<void>(resolve => observeReceiptWaiting(resolve));
  let saving!: Promise<boolean>;
  act(() => { app.input('Exit tail'); saving = app.drain(); });
  await act(async () => { await reached; window.dispatchEvent(new Event('blur')); });
  act(() => { app.view.result.current.onEditorFocus?.(); });
  await act(async () => { release(); await saving; await app.drain(); });
  expect(hasContentEditingSession(app.port, 'topic')).toBe(true);
  expect((await app.current()).body_text).toBe('Exit tail');
  expect((await app.current()).parent_version_ids).toHaveLength(1);
  await act(async () => { app.view.result.current.onExitEditorFocus(); await app.drain(); });
  expect(hasContentEditingSession(app.port, 'topic')).toBe(false);
  expect((await app.current()).parent_version_ids).toHaveLength(2);
});

it('retries a failed session registration without requiring another keystroke', async () => {
  const app = await createEditorHandoffFixture(true, true);
  transport.failSessionBegin = true;
  await act(async () => { app.input('Input awaiting registration'); expect(await app.drain()).toBe(false); });
  expect((await app.current()).body_text).toBe('Original');
  await act(async () => { expect(await app.drain()).toBe(true); });
  expect((await app.current()).body_text).toBe('Input awaiting registration');
  await act(async () => { window.dispatchEvent(new Event('blur')); await app.drain(); });
  expect(hasContentEditingSession(app.port, 'topic')).toBe(false);
});

it('keeps one input instance across autosaves and reception, then settles only after window exit', async () => {
  const app = await createEditorHandoffFixture(true, true);
  await act(async () => { app.input('Local 1'); expect(await app.drain()).toBe(true); });
  expect(hasContentEditingSession(app.port, 'topic')).toBe(true);
  await act(async () => { await app.remote(); });
  expect((await app.current()).body_text).toBe('Local 1');
  expect(app.view.result.current.editorContent).toBe('Local 1');
  await act(async () => { app.input('Local 2'); expect(await app.drain()).toBe(true); });
  expect((await app.current()).body_text).toBe('Local 2');
  expect((await app.current()).parent_version_ids).toHaveLength(1);
  // Buffered tail is accepted before blur, delivered afterwards by the editor.
  act(() => { app.input('Local 2 tail', false); window.dispatchEvent(new Event('blur')); });
  expect(hasContentEditingSession(app.port, 'topic')).toBe(true);
  await act(async () => { app.view.result.current.handleEditorChange('Local 2 tail'); await app.drain(); });
  expect(hasContentEditingSession(app.port, 'topic')).toBe(false);
  expect((await app.current()).parent_version_ids).toHaveLength(2);
  const alternatives = await app.port.query<{ body_text: string }>(
    "SELECT body_text FROM node_text_alternatives WHERE node_id = 'topic' AND status = 'available'");
  expect(new Set([(await app.current()).body_text, ...alternatives.map(entry => entry.body_text)]))
    .toContain('Local 2 tail');
  expect(app.ready).not.toContain(false);
});

it('settles native window loss even when Chromium emits no DOM blur', async () => {
  const original = Object.getOwnPropertyDescriptor(window, 'electronAPI');
  const handlers = new Set<() => void>();
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
    onWindowBlur: (handler: () => void) => { handlers.add(handler); return () => handlers.delete(handler); }
  } });
  try {
    const app = await createEditorHandoffFixture(true, true);
    await act(async () => { app.input('Local native exit'); expect(await app.drain()).toBe(true); });
    await act(async () => { await app.remote(); });
    expect((await app.current()).parent_version_ids).toHaveLength(1);
    await act(async () => { handlers.forEach(handler => handler()); await app.drain(); });
    expect((await app.current()).parent_version_ids).toHaveLength(2);
    expect(hasContentEditingSession(app.port, 'topic')).toBe(false);
    await act(async () => app.view.unmount());
    expect(handlers.size).toBe(0);
  } finally {
    if (original) Object.defineProperty(window, 'electronAPI', original);
    else Reflect.deleteProperty(window, 'electronAPI');
  }
});

it('finishes the previous node after its receipt without ending input in the next node', async () => {
  const app = await createEditorHandoffFixture(true, true);
  let release!: () => void;
  transport.receiptGate = new Promise(resolve => { release = resolve; });
  const reached = new Promise<void>(resolve => observeReceiptWaiting(resolve));
  let saving!: Promise<boolean>;
  act(() => { app.input('Previous node tail'); saving = app.drain(); });
  await act(async () => { await reached; app.select('other'); });
  act(() => app.input('Next node input'));
  await act(async () => { release(); await saving; expect(await app.drain()).toBe(true); });
  expect((await app.current()).body_text).toBe('Previous node tail');
  expect(app.view.result.current.editorContent).toBe('Next node input');
  expect(hasContentEditingSession(app.port, 'topic')).toBe(false);
  expect(hasContentEditingSession(app.port, 'other')).toBe(true);
  const [persisted] = await app.port.query<{ content: string }>("SELECT content FROM nodes WHERE id = 'other'");
  expect(persisted?.content).toBe('Next node input');
  await act(async () => { window.dispatchEvent(new Event('blur')); await app.drain(); });
  expect(hasContentEditingSession(app.port, 'other')).toBe(false);
});

it('keeps failed saves retryable and prevents an old exit from ending resumed input', async () => {
  const app = await createEditorHandoffFixture(true, true);
  transport.failSave = true;
  await act(async () => { app.input('Failed input'); expect(await app.drain()).toBe(false); });
  expect(hasContentEditingSession(app.port, 'topic')).toBe(true);
  await act(async () => { app.input('Retried input'); expect(await app.drain()).toBe(true); });
  let release!: () => void;
  transport.receiptGate = new Promise(resolve => { release = resolve; });
  const reached = new Promise<void>(resolve => observeReceiptWaiting(resolve));
  let saving!: Promise<boolean>;
  act(() => { app.input('Exit tail'); saving = app.drain(); });
  await act(async () => { await reached; window.dispatchEvent(new Event('blur')); });
  act(() => app.input('Resumed input'));
  await act(async () => { release(); await saving; expect(await app.drain()).toBe(true); });
  expect(hasContentEditingSession(app.port, 'topic')).toBe(true);
  expect((await app.current()).body_text).toBe('Resumed input');
  expect(app.view.result.current.editorContent).toBe('Resumed input');
  await act(async () => { window.dispatchEvent(new Event('blur')); await app.drain(); });
  expect(hasContentEditingSession(app.port, 'topic')).toBe(false);
});

it('settles keyboard focus departure after the buffered tail reaches SQLite', async () => {
  const app = await createEditorHandoffFixture(true, true);
  await act(async () => { app.input('Keyboard local'); expect(await app.drain()).toBe(true); });
  await act(async () => { await app.remote(); });
  act(() => { app.input('Keyboard local tail', false); app.view.result.current.onEditorFocusLeave?.(); });
  expect(hasContentEditingSession(app.port, 'topic')).toBe(true);
  await act(async () => { app.view.result.current.handleEditorChange('Keyboard local tail'); await app.drain(); });
  expect(hasContentEditingSession(app.port, 'topic')).toBe(false);
  expect((await app.current()).parent_version_ids).toHaveLength(2);
  expect(await app.bodies()).toContain('Keyboard local tail');
});

it.each(['exit', 'refocus', 'failure'])('waits for an asynchronous text command before exit (%s)', async mode => {
  const refocus = mode === 'refocus';
  const failed = mode === 'failure';
  const app = await createEditorHandoffFixture(true, true);
  await act(async () => { app.input('Before command'); expect(await app.drain()).toBe(true); });
  await act(async () => { await app.remote(); });
  const rendererModule = (modulePath: string) => import(modulePath);
  const { createPaletteCommandRunner } = await rendererModule('../../src/app/hooks/appPaletteCommandRunner.ts');
  const { APP_COMMAND_IDS } = await rendererModule('../../src/shared/commands/ids.ts');
  let release!: () => void;
  let done!: Promise<boolean>;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const run = createPaletteCommandRunner({ paletteItems: [], recordRecentCommand: () => undefined,
    setCommandPaletteOpen: () => undefined, undoWorkspaceAction: () => {
      done = gate.then(async () => {
        if (failed) return false;
        app.input('Command tail'); await app.drain(); return true;
      });
      return done;
    }
  } as unknown as Parameters<typeof createPaletteCommandRunner>[0]);
  let editingBeforeCompletion = false;
  await act(async () => {
    run(APP_COMMAND_IDS.undo);
    app.view.result.current.onExitEditorFocus();
    await app.drain();
    editingBeforeCompletion = hasContentEditingSession(app.port, 'topic');
    if (refocus) app.view.result.current.onEditorFocus();
    release();
    await done;
    await app.drain();
  });
  expect(editingBeforeCompletion).toBe(true);
  expect(await app.bodies()).toContain(failed ? 'Before command' : 'Command tail');
  expect(hasContentEditingSession(app.port, 'topic')).toBe(refocus || failed);
  if (refocus || failed) await act(async () => { app.view.result.current.onExitEditorFocus(); await app.drain(); });
  expect((await app.current()).parent_version_ids).toHaveLength(2);
});

const { registerEditorCompositionExitTests } = await import('./editorCompositionExit.test-support.js');
registerEditorCompositionExitTests();
