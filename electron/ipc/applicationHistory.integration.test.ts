// @vitest-environment node
import { expect, it, vi } from 'vitest';

import './applicationHistory.test-support.js';

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertVersionedNodeSnapshot } from '../database/nodeVersionedMutations.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import { applicationActions, bridge, createTextHistoryEntry, harness, id,
  read } from './applicationHistory.test-support.js';

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
