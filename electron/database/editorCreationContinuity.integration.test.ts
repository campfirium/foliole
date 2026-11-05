// @vitest-environment jsdom
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { act, cleanup, renderHook } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';

let root = '';
let deliverCreation: () => void;
let finishHold: () => void;
let creationVersion = '';
let holdGate: Promise<void>;
let rejectSave = false;
let rejectHold = false;
const submitted: Array<{ baseVersionId: string; versionId: string }> = [];
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: root,
  app_cache_dir: path.join(root, 'cache'), app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs') }) }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('../ipc/workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));
vi.mock('../../src/shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => invoke }));

import { saveDefaultLibraryHome } from '../ipc/libraryPathBootstrap.js';
import { handleEditorHoldCommand } from '../ipc/storageEditorHoldCommands.js';
import { handleNodeMutationCommand } from '../ipc/storageNodeMutationCommands.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';

async function invoke(command: string, args: Record<string, unknown>) {
  if (command === 'retain_node_editor_base') {
    await holdGate;
    if (rejectHold) throw new Error('hold_failed');
    return handleEditorHoldCommand(command, args);
  }
  if (command === 'release_node_editor_base') return handleEditorHoldCommand(command, args);
  if (command === 'create_topic') {
    const result = handleNodeMutationCommand(command, args);
    creationVersion = (result as { nodes: Array<{ currentVersionId: string }> }).nodes[0]!.currentVersionId;
    await new Promise<void>(resolve => { deliverCreation = resolve; });
    return result;
  }
  if (command === 'update_node_content_with_anchors') {
    if (rejectSave) { rejectSave = false; return null; }
    if (args.edit) submitted.push(args.edit as typeof submitted[number]);
    return handleNodeMutationCommand(command, args);
  }
  throw new Error(`Unexpected editor command: ${command}`);
}

// Cross the host's NodeNext compilation boundary using the renderer's actual modules.
const rendererModule = (modulePath: string) => import(modulePath);
const { useEditorDraftSync } = await rendererModule('../../src/app/hooks/useEditorDraftSync.ts');
const { useWorkspaceEditorBaseHold } = await rendererModule('../../src/app/components/useWorkspaceEditorBaseHold.ts');
const { createWorkspaceNodeActions } = await rendererModule('../../src/store/workspaceStoreNodeActions.ts');
const { createWorkspaceNodeActionsFixture } = await rendererModule('../../src/store/workspaceStoreNodeActions.test-support.ts');
const { drainPendingNodeContentRuntimePersists, resetPendingNodeContentRuntimePersistsForTests } =
  await rendererModule('../../src/store/workspaceStoreContentRuntimePersist.ts');
const { resetNodeContentVersionGuardForTests } = await rendererModule('../../src/store/workspaceNodeContentVersionGuard.ts');

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-creation-edit-'));
  saveDefaultLibraryHome();
  initializeDatabase();
  submitted.length = 0;
  rejectSave = false;
  rejectHold = false;
  holdGate = new Promise(resolve => { finishHold = resolve; });
  vi.useFakeTimers();
});
afterEach(async () => {
  await act(async () => {
    finishHold();
    cleanup();
    await drainPendingNodeContentRuntimePersists();
  });
  resetPendingNodeContentRuntimePersistsForTests();
  resetNodeContentVersionGuardForTests();
  vi.clearAllTimers();
  vi.useRealTimers();
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

function editorFixture() {
  const store = createStore<ReturnType<typeof createWorkspaceNodeActionsFixture>>(() => createWorkspaceNodeActionsFixture());
  const actions = createWorkspaceNodeActions(store.setState, store.getState);
  const commits: boolean[] = [];
  const view = renderHook(() => {
    const state = useSyncExternalStore(store.subscribe, store.getState);
    const node = state.activeNodeId ? state.nodesById[state.activeNodeId] : null;
    const draft = useEditorDraftSync({ nodeId: node?.id ?? null, committedContent: node?.content ?? '',
      committedVersionId: node?.currentVersionId,
      onCommit: (id: string, content: string, options: unknown) => actions.updateNodeContent(id, content, options) });
    const ready = useWorkspaceEditorBaseHold({ nodeId: node?.id ?? null, versionId: node?.currentVersionId,
      flushDraft: draft.flushDraftSynchronously });
    commits.push(ready);
    return { ...draft, ready };
  });
  return { store, actions, view, commits };
}

it.each(['save', 'hold'] as const)('keeps accepting new-topic input after a failed %s', async fault => {
  const app = editorFixture();
  let creating!: Promise<string | null>;
  act(() => { creating = app.actions.createRootNode(''); });
  const nodeId = app.store.getState().activeNodeId!;
  await act(async () => { deliverCreation(); await creating; });
  rejectHold = fault === 'hold';
  await act(async () => { finishHold(); });
  rejectSave = fault === 'save';
  act(() => {
    app.view.result.current.handleEditorInput({ nodeId, contentLength: 5 });
    app.view.result.current.handleEditorChange('First');
    vi.advanceTimersByTime(0);
  });
  await act(async () => {
    expect(await drainPendingNodeContentRuntimePersists()).toBe(fault !== 'save');
  });
  expect(app.view.result.current.ready).toBe(true);
  expect(app.view.result.current.editorContent).toBe('First');
  await act(async () => {
    app.view.result.current.handleEditorInput({ nodeId, contentLength: 15 });
    app.view.result.current.handleEditorChange('First continued');
    vi.advanceTimersByTime(0);
    expect(await drainPendingNodeContentRuntimePersists()).toBe(true);
  });
  expect(app.view.result.current.ready).toBe(true);
  expect(openDatabaseConnection().sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(nodeId))
    .toBe('First continued');
});

it('hands off both drafts when creation receipts arrive after switching to a second new topic', async () => {
  const app = editorFixture();
  let firstCreating!: Promise<string | null>;
  let secondCreating!: Promise<string | null>;
  act(() => { firstCreating = app.actions.createRootNode(''); });
  const firstId = app.store.getState().activeNodeId!;
  const deliverFirst = deliverCreation;
  act(() => {
    app.view.result.current.handleEditorInput({ nodeId: firstId, contentLength: 11 });
    app.view.result.current.handleEditorChange('First draft');
    secondCreating = app.actions.createRootNode('');
  });
  const secondId = app.store.getState().activeNodeId!;
  const deliverSecond = deliverCreation;
  act(() => {
    app.view.result.current.handleEditorInput({ nodeId: secondId, contentLength: 12 });
    app.view.result.current.handleEditorChange('Second draft');
  });
  await act(async () => { deliverFirst(); await firstCreating; });
  expect(app.view.result.current.editorContent).toBe('Second draft');
  expect(app.view.result.current.ready).toBe(true);
  await act(async () => {
    deliverSecond(); await secondCreating;
    vi.advanceTimersByTime(0);
    expect(await drainPendingNodeContentRuntimePersists()).toBe(true);
    finishHold();
  });
  expect(openDatabaseConnection().sqlite.prepare('SELECT content FROM nodes WHERE id IN (?, ?) ORDER BY content').pluck().all(firstId, secondId))
    .toEqual(['First draft', 'Second draft']);
  expect(app.view.result.current.editorContent).toBe('Second draft');
  expect(app.view.result.current.ready).toBe(true);
});

it.each(['input-evidence', 'pending-draft', 'save-queue'] as const)(
  'creates, keeps accepting input and persists the full document across %s confirmation', async stage => {
    const app = editorFixture();
    let creating!: Promise<string | null>;
    act(() => { creating = app.actions.createRootNode(''); });
    const nodeId = app.store.getState().activeNodeId!;
    const first = 'First 中😀\n\n```js\nconst value = 1;\n```';
    app.commits.length = 0;
    act(() => {
      app.view.result.current.handleEditorInput({ nodeId, contentLength: first.length });
      if (stage !== 'input-evidence') app.view.result.current.handleEditorChange(first);
      if (stage === 'save-queue') vi.advanceTimersByTime(0);
    });
    await act(async () => { deliverCreation(); await creating; });
    expect(app.view.result.current.ready).toBe(true);
    if (stage === 'input-evidence') act(() => app.view.result.current.handleEditorChange(first));
    await act(async () => {
      vi.advanceTimersByTime(0);
      await drainPendingNodeContentRuntimePersists();
    });
    expect(submitted[0]?.baseVersionId).toBe(creationVersion);
    expect(app.commits).not.toContain(false);
    const continued = first + '\nContinued after save';
    await act(async () => {
      app.view.result.current.handleEditorInput({ nodeId, contentLength: continued.length });
      app.view.result.current.handleEditorChange(continued);
      vi.advanceTimersByTime(0);
      await drainPendingNodeContentRuntimePersists();
    });
    expect(submitted[1]?.baseVersionId).toBe(submitted[0]?.versionId);
    expect(app.commits).not.toContain(false);
    expect(app.view.result.current.editorContent).toBe(continued);
    await act(async () => { finishHold(); });
    await act(async () => {
      app.view.unmount();
      await drainPendingNodeContentRuntimePersists();
    });
    const sqlite = openDatabaseConnection().sqlite;
    expect(sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(nodeId)).toBe(continued);
    expect(sqlite.prepare('SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = ?').pluck().get(submitted[0]!.versionId))
      .toBe(creationVersion);
    closeDatabaseConnection();
    expect(openDatabaseConnection().sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(nodeId)).toBe(continued);
  });
