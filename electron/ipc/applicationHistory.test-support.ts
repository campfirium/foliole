// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, vi } from 'vitest';

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
export let harness: ReturnType<typeof createWorkspaceNodeActionsSetStateHarness>;
export let id = '';
export let applicationActions: ReturnType<typeof createApplicationHistoryActions>;
export const read = () => openDatabaseConnection().driver.queryOne('SELECT reveal, deleted_at FROM nodes WHERE id = ?', [id]);
export const session = () => getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1');

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


export { bridge, createTextHistoryEntry };
