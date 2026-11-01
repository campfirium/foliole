// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('./paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: appDataDir,
  app_cache_dir: path.join(appDataDir, 'cache'), app_config_dir: path.join(appDataDir, 'config'),
  app_log_dir: path.join(appDataDir, 'logs') }) }));
vi.mock('./boot.js', () => ({ appendBootEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('../foliolePublish/foliolePublishManagement.js', () => ({ assertFoliolePublishedDeleteAllowed: vi.fn() }));
vi.mock('../deviceAnchorStore.js', () => ({ loadDesktopLibraryWriterBinding: (libraryPath: string) => ({ deviceAnchor: 'application-history', libraryPath }) }));
const bridge = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../src/shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => bridge.invoke }));

import { mapGradeToRustRating } from '../../lib/core/review/types.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { openDesktopDailyFlow, commitDesktopDailyFlow } from '../database/dailyFlow.js';
import { initializeDatabase } from '../database/migrate.js';
import { drainDirtyNodeSyncVersions } from '../database/nodeSyncVersionDrain.js';
import { upsertVersionedNodeSnapshot } from '../database/nodeVersionedMutations.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import { reviewGrade, reviewPreview } from './review.js';
import { handleNodeMutationCommand } from './storageNodeMutationCommands.js';
import { handleReadingAndReviewCommand, handleWorkspaceReadCommand } from './storageReadCommands.js';

// Renderer modules retain their bundler resolution across the host's NodeNext boundary.
const rendererModule = (modulePath: string) => import(modulePath);
const { createWorkspaceNodeActionsFixture, createWorkspaceNodeActionsSetStateHarness } =
  await rendererModule('../../src/store/workspaceStoreNodeActions.test-support.ts');
const { createWorkspaceReviewActions } = await rendererModule('../../src/store/workspaceStoreReviewActions.ts');
const { createWorkspaceNodeActions } = await rendererModule('../../src/store/workspaceStoreNodeActions.ts');
const { createWorkspaceEditorOperationHistoryActions } = await rendererModule('../../src/store/workspaceEditorOperationHistory.ts');
const { createApplicationHistoryActions } = await rendererModule('../../src/store/workspaceApplicationHistoryActions.ts');
const { createApplicationHistory } = await rendererModule('../../src/store/workspaceApplicationHistory.ts');
const { publishApplicationHistories } = await rendererModule('../../src/store/workspaceApplicationHistoryPublish.ts');
const { projectApplicationWorkspaceHistory } = await rendererModule('../../src/store/workspaceApplicationWorkspaceHistory.ts');
const { getEditorOperationSession } = await rendererModule('../../src/features/editor/model/editorOperationHistory.ts');
const { createTextHistoryEntry } = await rendererModule('../../src/features/editor/model/editorOperationHistory.testSupport.ts');
const { resetNodeContentVersionGuardForTests } = await rendererModule('../../src/store/workspaceNodeContentVersionGuard.ts');
const { resetPendingNodeContentRuntimePersistsForTests } = await rendererModule('../../src/store/workspaceStoreContentRuntimePersist.ts');

let root = '';
let harness: ReturnType<typeof createWorkspaceNodeActionsSetStateHarness>;
let id = '';
let applicationActions: ReturnType<typeof createApplicationHistoryActions>;
const read = () => openDatabaseConnection().driver.queryOne('SELECT reveal, deleted_at FROM nodes WHERE id = ?', [id]);
const session = () => getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1');

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-annotation-history-'));
  appDataDir = path.join(root, 'data');
  await initializeDatabase();
  const fixture = createWorkspaceNodeActionsFixture();
  const parent = fixture.nodesById['node-1'];
  const currentVersionId = upsertVersionedNodeSnapshot({ ...parent, nodeId: parent.id, position: 0 });
  fixture.nodesById['node-1'] = { ...parent, currentVersionId };
  harness = createWorkspaceNodeActionsSetStateHarness(fixture);
  const write = harness.setState;
  const set = (patch: Parameters<typeof write>[0]) => {
    write((state: ReturnType<typeof harness.getState>) => publishApplicationHistories(typeof patch === 'function' ? patch(state) : patch, state));
    applicationActions?.wakeApplicationHistory();
  };
  applicationActions = createApplicationHistoryActions(set, harness.getState);
  set({ appActionHistory: projectApplicationWorkspaceHistory(fixture.appActionHistory, createApplicationHistory()) });
  const actions = createWorkspaceNodeActions(set, harness.getState);
  const history = createWorkspaceEditorOperationHistoryActions(set, harness.getState);
  const review = createWorkspaceReviewActions(set, harness.getState, {
    preview: (request: Parameters<typeof reviewPreview>[0]['request']) => reviewPreview({ request }),
    grade: (request: Parameters<typeof reviewGrade>[0]['request'] & { grade: Parameters<typeof mapGradeToRustRating>[0] }) =>
      reviewGrade({ request: { ...request, rating: mapGradeToRustRating(request.grade) } })
  });
  harness.setState({ ...actions, ...history, ...review, ...applicationActions });
  bridge.invoke.mockReset().mockImplementation(async (command, args) => {
    if (command === 'open_daily_flow') return openDesktopDailyFlow(args);
    if (command === 'commit_daily_flow') return commitDesktopDailyFlow(args);
    return await handleNodeMutationCommand(command, args) ?? handleWorkspaceReadCommand(command, args) ?? handleReadingAndReviewCommand(command, args);
  });
  id = await harness.getState().createQANodeFromSelection('node-1', 'Prompt', 'Seed', 'cloze', {
    id: 'cloze', kind: 'cloze', locator: { from: 2, to: 6, originalText: 'Seed' }
  });
  expect(id).toBeTruthy();
  expect(session().undoStack.at(-1)).toMatchObject({ canonical: 'confirmed', historyFacts: [expect.objectContaining({ nodeId: id })] });
});
afterEach(async () => {
  await drainDirtyNodeSyncVersions();
  resetPendingNodeContentRuntimePersistsForTests();
  resetNodeContentVersionGuardForTests();
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it('undoes and redoes creation, an answer and a grade through one application owner and SQLite instance', async () => {
  const node = harness.getState().nodesById[id];
  harness.getState().pushEditorOperationEntry({ ...createTextHistoryEntry({ nodeId: `${id}:answer`, beforeContent: 'Seed', afterContent: 'Answer' }),
    target: { nodeId: id, field: 'reveal', beforeVersionId: node.currentVersionId!, afterVersionId: '' } });
  expect(await harness.getState().updateNodeReveal(id, 'Answer')).toBe(true);
  expect(read()).toMatchObject({ reveal: 'Answer', deleted_at: null });
  const now = new Date(Date.parse(node.review.due) + 60_000).toISOString();
  await harness.getState().setReviewSessionMode('review-first', now);
  const selected = await harness.getState().resumeReviewSession(now, { preferredNodeId: id });
  expect(selected).toBe(id);
  harness.getState().revealReviewAnswer();
  expect(await harness.getState().gradeReviewCard(3, now)).toBe(true);
  expect(loadWorkspaceSnapshot({ includeBody: true })!.nodesById[id]?.review?.reps).toBe(1);
  expect(applicationActions.undoApplicationOperation()).toBe(true);
  expect(applicationActions.undoApplicationOperation()).toBe(true);
  expect(applicationActions.undoApplicationOperation()).toBe(true);
  await vi.waitFor(() => expect(read()).toMatchObject({ reveal: 'Seed', deleted_at: expect.any(String) }));
  await vi.waitFor(() => expect(harness.getState().appActionHistory.application?.requests).toEqual([]));
  expect(openDatabaseConnection().driver.queryOne<{ reps: number }>('SELECT reps FROM node_review WHERE node_id = ?', [id])?.reps).toBe(0);
  expect(applicationActions.redoApplicationOperation()).toBe(true);
  expect(applicationActions.redoApplicationOperation()).toBe(true);
  expect(applicationActions.redoApplicationOperation()).toBe(true);
  await vi.waitFor(() => expect(read()).toMatchObject({ reveal: 'Answer', deleted_at: null }));
  await vi.waitFor(() => expect(harness.getState().appActionHistory.application?.requests).toEqual([]));
  closeDatabaseConnection();
  await initializeDatabase();
  expect(read()).toMatchObject({ reveal: 'Answer', deleted_at: null });
  expect(loadWorkspaceSnapshot({ includeBody: true })!.nodesById[id]?.review?.reps).toBe(1);
});

it('settles a committed rename undo while retaining facts changed before its receipt arrives', async () => {
  expect(await harness.getState().updateNodeTitle('node-1', 'Renamed')).toBe(true);
  const original = harness.getState().nodesById['node-1'];
  const native = bridge.invoke.getMockImplementation()!;
  bridge.invoke.mockImplementationOnce(async (command, args) => {
    const receipt = await native(command, args);
    const newer = { ...original, title: 'External title', content: '# External title', updatedAt: new Date().toISOString() };
    const currentVersionId = upsertVersionedNodeSnapshot({ ...newer, nodeId: newer.id, position: 0 });
    harness.setState({ nodesById: { ...harness.getState().nodesById, 'node-1': { ...newer, currentVersionId } } });
    return receipt;
  });
  expect(applicationActions.undoApplicationOperation()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.application?.requests).toEqual([]));
  expect(harness.getState().appActionHistory.application?.redo.at(-1)?.entry.type).toBe('structure.rename');
  expect(harness.getState().nodesById['node-1'].title).toBe('External title');
  expect(openDatabaseConnection().driver.queryOne<{ title: string }>('SELECT title FROM nodes WHERE id = ?', ['node-1'])?.title).toBe('External title');
});

it('records directed annotation restoration after another document edit and reverses the actual order', async () => {
  harness.getState().deleteEditorAnnotationNodes([id]);
  await vi.waitFor(() => expect(read()?.deleted_at).toEqual(expect.any(String)));
  const parent = harness.getState().nodesById['node-1'];
  harness.getState().pushEditorOperationEntry(createTextHistoryEntry({ nodeId: 'node-1', beforeContent: parent.content, afterContent: '# Updated' }));
  expect(await harness.getState().updateNodeContent('node-1', '# Updated')).toBe(true);
  expect(await harness.getState().restoreNode(id)).toBe(id);
  expect(read()?.deleted_at).toBeNull();
  expect(applicationActions.undoApplicationOperation()).toBe(true);
  await vi.waitFor(() => expect(read()?.deleted_at).toEqual(expect.any(String)));
  expect(harness.getState().nodesById['node-1'].content).toBe('# Updated');
  expect(applicationActions.undoApplicationOperation()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().nodesById['node-1'].content).toBe(parent.content));
  expect(applicationActions.undoApplicationOperation()).toBe(true);
  await vi.waitFor(() => expect(read()?.deleted_at).toBeNull());
  await vi.waitFor(() => expect(harness.getState().appActionHistory.application?.requests).toEqual([]));
  for (let i = 0; i < 3; i++) expect(applicationActions.redoApplicationOperation()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.application?.requests).toEqual([]));
  expect(read()?.deleted_at).toBeNull();
  expect(harness.getState().nodesById['node-1'].content).toBe('# Updated');
});

it('records directed workspace restoration without consuming later text and rebases Trash timestamps for redo', async () => {
  const other = await harness.getState().createRootNode('# Other');
  expect(other).toBeTruthy();
  harness.getState().deleteNode('node-1');
  await vi.waitFor(() => expect(read()?.deleted_at).toEqual(expect.any(String)));
  await vi.waitFor(() => expect(harness.getState().appActionHistory.pendingAction).toBeNull());
  harness.getState().pushEditorOperationEntry(createTextHistoryEntry({ nodeId: other, beforeContent: '# Other', afterContent: '# Other edited' }));
  expect(await harness.getState().updateNodeContent(other, '# Other edited')).toBe(true);
  expect(await harness.getState().restoreNode('node-1')).toBe('node-1');
  expect(read()?.deleted_at).toBeNull();
  expect(applicationActions.undoApplicationOperation()).toBe(true);
  await vi.waitFor(() => expect(read()?.deleted_at).toEqual(expect.any(String)));
  expect(harness.getState().nodesById[other].content).toBe('# Other edited');
  expect(applicationActions.undoApplicationOperation()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().nodesById[other].content).toBe('# Other'));
  expect(applicationActions.undoApplicationOperation()).toBe(true);
  await vi.waitFor(() => expect(read()?.deleted_at).toBeNull());
  await vi.waitFor(() => expect(harness.getState().appActionHistory.application?.requests).toEqual([]));
  for (let i = 0; i < 3; i++) expect(applicationActions.redoApplicationOperation()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.application?.requests).toEqual([]));
  expect(read()?.deleted_at).toBeNull();
  expect(harness.getState().nodesById[other].content).toBe('# Other edited');
});
