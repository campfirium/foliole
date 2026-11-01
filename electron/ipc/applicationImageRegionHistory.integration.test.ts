// @vitest-environment node
import { expect, it, vi } from 'vitest';

import './applicationHistory.test-support.js';

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import { applicationActions, bridge, createTextHistoryEntry, harness, id } from './applicationHistory.test-support.js';

it('orders image-region deletion at acceptance and restores its native facts after a later edit', async () => {
  const [imageId] = await harness.getState().createImageClozeNodes('node-1', 'image', {
    promptContent: '![Image](asset://image.png)', revealContent: '![Image](asset://image.png)'
  }, [{ id: 'region', answer: 'Image answer', x: 0.1, y: 0.2, width: 0.3, height: 0.4 }]);
  expect(imageId).toBeTruthy();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const original = bridge.invoke.getMockImplementation()!;
  bridge.invoke.mockImplementation(async (command, args) => {
    const result = await original(command, args);
    if (command === 'soft_delete_nodes') await held;
    return result;
  });
  const deletion = harness.getState().deleteImageClozeRegion('node-1', 'image', 'region');
  const imageRow = () => openDatabaseConnection().driver.queryOne('SELECT deleted_at FROM nodes WHERE id = ?', [imageId]);
  await vi.waitFor(() => expect(imageRow()?.deleted_at).toEqual(expect.any(String)));
  const parent = harness.getState().nodesById['node-1'];
  harness.getState().pushEditorOperationEntry(createTextHistoryEntry({ nodeId: 'node-1', beforeContent: parent.content, afterContent: '# Later body' }));
  expect(await harness.getState().updateNodeContent('node-1', '# Later body')).toBe(true);
  expect(await harness.getState().updateNodeReveal(id, 'Later answer')).toBe(true);
  release();
  await deletion;
  const owner = harness.getState().appActionHistory.application;
  expect(harness.getState().nodesById['node-1']).toMatchObject({ content: '# Later body', imageRegions: null });
  harness.getState().setActiveNode(id);
  expect(applicationActions.undoApplicationOperation()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().nodesById['node-1'].content).toBe(parent.content));
  expect(imageRow()?.deleted_at).toEqual(expect.any(String));
  expect(owner.undo.slice(-2).map((operation: { entry: { type: string } }) => operation.entry.type)).toEqual(['annotation.delete', 'text.edit']);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.application?.requests).toEqual([]));
  expect(applicationActions.undoApplicationOperation()).toBe(true);
  await vi.waitFor(() => expect(imageRow()?.deleted_at).toBeNull());
  await vi.waitFor(() => expect(harness.getState().appActionHistory.application?.requests).toEqual([]));
  expect(harness.getState().nodesById['node-1'].imageRegions).toEqual(parent.imageRegions);
  expect(harness.getState().nodesById[id].reveal).toBe('Later answer');
  expect(applicationActions.redoApplicationOperation()).toBe(true);
  await vi.waitFor(() => expect(imageRow()?.deleted_at).toEqual(expect.any(String)));
  await vi.waitFor(() => expect(harness.getState().appActionHistory.application?.requests).toEqual([]));
  expect(applicationActions.redoApplicationOperation()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().nodesById['node-1'].content).toBe('# Later body'));
  await vi.waitFor(() => expect(harness.getState().appActionHistory.application?.requests).toEqual([]));
  closeDatabaseConnection();
  await initializeDatabase();
  const persisted = loadWorkspaceSnapshot({ includeBody: true })!;
  expect(persisted.nodesById['node-1']?.content).toBe('# Later body');
  expect(persisted.nodesById['node-1']?.imageRegions ?? null).toBeNull();
  expect(persisted.nodesById[id]?.reveal).toBe('Later answer');
  expect(imageRow()?.deleted_at).toEqual(expect.any(String));
});
