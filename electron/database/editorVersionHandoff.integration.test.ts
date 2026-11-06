// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: transport.root,
  app_cache_dir: `${transport.root}/cache`, app_config_dir: `${transport.root}/config`, app_log_dir: `${transport.root}/logs` }) }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('../ipc/workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));
vi.mock('../../src/shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () =>
  (command: string, args: Record<string, unknown>) => invokeEditorHandoff(command, args) }));

import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { readTopicAlternativeRecords } from '../../lib/core/sync/topicAlternativeStore.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { createEditorHandoffFixture, invokeEditorHandoff, observeReceiptWaiting, setupEditorHandoffTests, transport } from './editorHandoff.test-support.js';

setupEditorHandoffTests();

it('reconciles a remote refresh deferred by a local save whose receipt has not arrived', async () => {
  const app = await createEditorHandoffFixture(true);
  let finishReceipt!: () => void;
  transport.receiptGate = new Promise(resolve => { finishReceipt = resolve; });
  const receiptReached = new Promise<void>(resolve => { observeReceiptWaiting(resolve); });
  let saving!: Promise<boolean>;
  act(() => { app.input('Local saved'); saving = app.drain(); });
  await act(async () => { await receiptReached; });
  await act(async () => { await app.remote(await app.current()); });
  expect((await app.current()).body_text).toBe('Remote');
  expect(app.view.result.current.editorContent).toBe('Local saved');
  await act(async () => {
    finishReceipt();
    expect(await saving).toBe(true);
    await vi.advanceTimersByTimeAsync(1200);
  });
  expect(app.view.result.current.editorContent).toBe('Remote');
  expect(app.ready.every(Boolean)).toBe(true);
  expect(app.ready).not.toContain(false);
  await act(async () => { app.input('Remote continued'); expect(await app.drain()).toBe(true); });
  expect((await app.current()).body_text).toBe('Remote continued');
});

it('adopts a remote body while idle and saves input based on that exact version', async () => {
  const app = await createEditorHandoffFixture();
  await act(async () => { await app.remote(); });
  expect(app.view.result.current.editorContent).toBe('Remote');
  expect(app.ready.every(Boolean)).toBe(true);
  expect(app.heldBases()).not.toContain('base');
  await act(async () => { app.input('Remote continued'); expect(await app.drain()).toBe(true); });
  expect(transport.submitted[0]?.baseVersionId).toBe('remote');
  expect(app.ready).not.toContain(false);
  expect((await app.current()).body_text).toBe('Remote continued');
  expect(await app.converge()).toEqual(await app.bodies());
});

it.each([false, true])('preserves buffered input, its alternatives and continued saves through remote adoption (save fails: %s)', async failSave => {
  const app = await createEditorHandoffFixture();
  let finishRemote!: () => void;
  transport.remoteGate = new Promise(resolve => { finishRemote = resolve; });
  act(() => app.input('Local', false));
  await act(async () => { await app.remote(); });
  expect(app.ready.every(Boolean)).toBe(true);
  expect(app.view.result.current.editorContent).toBe('Original');
  expect(app.heldBases()).toEqual([]);
  await act(async () => { finishRemote(); });
  expect(app.view.result.current.editorContent).toBe('Original');
  expect(app.heldBases()).toEqual([]);
  expect(await app.bodies()).toContain('Unique alternative');
  transport.failSave = failSave;
  let finishReceipt!: () => void;
  transport.receiptGate = new Promise(resolve => { finishReceipt = resolve; });
  let saving!: Promise<boolean>;
  act(() => { app.view.result.current.handleEditorChange('Local'); saving = app.drain(); });
  act(() => app.input('Local continued', false));
  await act(async () => {
    finishReceipt();
    expect(await saving).toBe(!failSave);
  });
  if (failSave) expect(app.heldBases()).toEqual([]);
  expect(app.view.result.current.editorContent).toBe('Local');
  await act(async () => { app.view.result.current.handleEditorChange('Local continued'); expect(await app.drain()).toBe(true); });
  expect(app.ready).not.toContain(false);
  expect(transport.submitted[0]?.baseVersionId).toBe('base');
  const bodies = await app.bodies();
  expect(bodies.has('Local continued')).toBe(true);
  expect(bodies.has('Remote')).toBe(true);
  expect(await app.converge()).toEqual(bodies);
  await act(async () => { app.view.unmount(); });
  expect(app.heldBases()).toEqual([]);
  closeDatabaseConnection();
  const reopened = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
  expect(new Set([(await loadCurrentSyncNodeRecord(reopened, 'topic'))!.body_text,
    ...(await readTopicAlternativeRecords(reopened, 'topic')).map(row => row.body_text)])).toEqual(bodies);
});

it('uses the current idle document without collection protection', async () => {
  const app = await createEditorHandoffFixture();
  transport.failRetain = true;
  await act(async () => { await app.remote(); });
  expect(app.ready.every(Boolean)).toBe(true);
  expect(app.view.result.current.editorContent).toBe('Remote');
  await act(async () => { app.input('Continued without hold'); expect(await app.drain()).toBe(true); });
  expect(transport.submitted[0]?.baseVersionId).toBe('remote');
  expect(app.ready).not.toContain(false);
  const bodies = await app.bodies();
  expect(bodies.has('Continued without hold')).toBe(true);
  expect((await app.current()).parent_version_ids).toEqual(['remote']);
  expect(bodies.has('Unique alternative')).toBe(true);
  expect(await app.converge()).toEqual(bodies);
});

it('keeps the old submitted text separate while another topic accepts input and its receipt is delayed', async () => {
  const app = await createEditorHandoffFixture();
  let finishReceipt!: () => void;
  transport.receiptGate = new Promise(resolve => { finishReceipt = resolve; });
  let saving!: Promise<boolean>;
  act(() => { app.input('Old topic final'); saving = app.drain(); });
  await act(async () => { app.select('other'); });
  expect(app.heldBases()).toEqual([]);
  act(() => app.input('Other topic continued'));
  expect(app.view.result.current.editorContent).toBe('Other topic continued');
  await act(async () => {
    finishReceipt();
    expect(await saving).toBe(true);
    expect(await app.drain()).toBe(true);
  });
  expect(app.ready.every(Boolean)).toBe(true);
  expect(app.view.result.current.editorContent).toBe('Other topic continued');
  expect((await app.current()).body_text).toBe('Old topic final');
  expect(openDatabaseConnection().sqlite.prepare("SELECT content FROM nodes WHERE id = 'other'").pluck().get())
    .toBe('Other topic continued');
  expect(app.heldBases()).toEqual([]);
});
