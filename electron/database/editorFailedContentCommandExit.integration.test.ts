// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: transport.root,
  app_cache_dir: `${transport.root}/cache`, app_config_dir: `${transport.root}/config`, app_log_dir: `${transport.root}/logs` }) }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('../ipc/workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));
vi.mock('../../src/shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () =>
  (command: string, args: Record<string, unknown>) => command === 'dev_reimport_current_topic_source'
    ? reimportWithDelayedReceipt(args) : invokeEditorHandoff(command, structuredClone(args)) }));

import { hasContentEditingSession } from '../../lib/core/sync/contentEditingSession.js';
import { reimportCurrentTopicSource } from '../import/currentSourceReimport.js';

import { runWithDatabaseConnectionOwner } from './connection.js';
import { createEditorHandoffFixture, invokeEditorHandoff, setupEditorHandoffTests, transport } from './editorHandoff.test-support.js';

const rendererModule = (modulePath: string) => import(modulePath);
const { createReimportSelectedTopicCommand } = await rendererModule('../../src/app/hooks/appPaletteReimportCommand.ts');
const { runWorkspaceContentCommand } = await rendererModule('../../src/store/workspaceContentCommands.ts');

let reimportReceipt: Promise<void>;
let observeReimportResult: (status: string) => void;

async function reimportWithDelayedReceipt(args: Record<string, unknown>) {
  const result = await runWithDatabaseConnectionOwner(() => reimportCurrentTopicSource(String(args.node_id)));
  observeReimportResult(result.status);
  await reimportReceipt;
  return result;
}

setupEditorHandoffTests();

it.each([false, true])('settles the topic left during a failed re-import (next input before failure: %s)', async nextInputFirst => {
  const app = await createEditorHandoffFixture(true, true);
  await act(async () => { app.input('Saved in the previous topic'); expect(await app.drain()).toBe(true); });
  const reimport = createReimportSelectedTopicCommand({ ws: { activeNodeId: 'topic' },
    runtime: { isViewingTrashNode: false, flushPendingEditorDraftImmediately: app.drain } });
  let finishReceipt!: () => void;
  reimportReceipt = new Promise(resolve => { finishReceipt = resolve; });
  const reached = new Promise<string>(resolve => { observeReimportResult = resolve; });
  const inputNext = () => act(async () => { app.input('Saved in the next topic'); expect(await app.drain()).toBe(true); });
  let pending!: Promise<boolean>;

  try {
    await act(async () => {
      pending = runWorkspaceContentCommand(reimport);
      expect(await reached).toBe('unavailable');
      app.view.result.current.onEditorFocusLeave?.();
      app.select('other');
    });
    expect(hasContentEditingSession(app.port, 'topic')).toBe(true);
    if (nextInputFirst) await inputNext();
    await act(async () => { finishReceipt(); expect(await pending).toBe(false); });
    if (!nextInputFirst) await inputNext();
  } finally {
    finishReceipt();
  }

  await act(async () => { await app.remote(); });
  expect((await app.current()).parent_version_ids).toHaveLength(2);
  expect(await app.bodies()).toContain('Saved in the previous topic');
  expect(hasContentEditingSession(app.port, 'topic')).toBe(false);
  expect(hasContentEditingSession(app.port, 'other')).toBe(true);
  expect(await app.port.query("SELECT content FROM nodes WHERE id = 'other'")).toEqual([{ content: 'Saved in the next topic' }]);
});

it('settles a departed editor after its composition tail writes to the previous topic', async () => {
  const app = await createEditorHandoffFixture(true, true);
  await act(async () => { app.input('Before composition'); expect(await app.drain()).toBe(true); });
  let completeComposition!: () => void;
  const composition = new Promise<void>(resolve => { completeComposition = resolve; });
  act(() => { app.view.result.current.onEditorPendingInput?.(composition); });
  await act(async () => { app.select('other'); });
  expect(hasContentEditingSession(app.port, 'topic')).toBe(true);

  const tail = 'Composition accepted by the previous topic';
  await act(async () => {
    app.view.result.current.onEditorInput?.({ nodeId: 'topic', contentLength: tail.length });
    app.view.result.current.handleEditorChange(tail, { nodeId: 'topic' });
    completeComposition();
    expect(await app.drain()).toBe(true);
  });

  expect((await app.current()).body_text).toBe(tail);
  expect(hasContentEditingSession(app.port, 'topic')).toBe(false);
  expect(app.store.getState().nodesById.topic?.content).toBe('');
  await act(async () => { await app.remote(); });
  expect((await app.current()).parent_version_ids).toHaveLength(2);
  expect(await app.bodies()).toContain(tail);
});

it('retries a departed topic on blur after its composition tail initially fails to save', async () => {
  const app = await createEditorHandoffFixture(true, true);
  await act(async () => { app.input('Before composition'); expect(await app.drain()).toBe(true); });
  let completeComposition!: () => void;
  const composition = new Promise<void>(resolve => { completeComposition = resolve; });
  act(() => { app.view.result.current.onEditorPendingInput?.(composition); });
  await act(async () => { app.select('other'); });

  const tail = 'Unsaved composition tail for the previous topic';
  await act(async () => { app.input('Input for the current topic'); expect(await app.drain()).toBe(true); });
  transport.failSave = true;
  await act(async () => {
    app.view.result.current.onEditorInput?.({ nodeId: 'topic', contentLength: tail.length });
    app.view.result.current.handleEditorChange(tail, { nodeId: 'topic' });
    completeComposition();
  });
  expect(transport.failSave).toBe(false);
  expect((await app.current()).body_text).toBe('Before composition');
  expect(hasContentEditingSession(app.port, 'topic')).toBe(true);

  await act(async () => { window.dispatchEvent(new Event('blur')); });

  expect((await app.current()).body_text).toBe(tail);
  expect(app.store.getState().nodesById.topic?.content).toBe('');
  expect(hasContentEditingSession(app.port, 'topic')).toBe(false);
  expect(hasContentEditingSession(app.port, 'other')).toBe(false);
  expect(await app.port.query("SELECT content FROM nodes WHERE id = 'other'"))
    .toEqual([{ content: 'Input for the current topic' }]);
});
