import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { runAgentCli } from '../../scripts/agent-control/foliole-agent.mjs';

import { expect, test } from './harness/fixtures';

for (const source of ['desktop', 'CLI'] as const) {
  test(`finds a subtree deleted from the ${source} and restores it through the CLI`, async ({ desktopApp, desktopWindow }) => {
    await verifyTrashJourney(source, desktopApp, desktopWindow);
  });
}

async function verifyTrashJourney(
  source: 'desktop' | 'CLI',
  desktopApp: ElectronApplication,
  desktopWindow: Page
) {
  const userData = await desktopApp.evaluate(({ app }) => app.getPath('userData'));
  const descriptor = path.join(userData, 'cache', 'agent-control-session.json');
  const run = (command: string, ...args: string[]) => runAgentCli([command, '--descriptor', descriptor, ...args]);
  const folder = await run('materials/create', '--kind', 'folder', '--title', 'Trash journey folder');
  expect(folder.status).toBe(0);
  const folderId = folder.output.material.id;
  const topic = await run('materials/create', '--kind', 'topic', '--parent-id', folderId,
    '--title', 'Trash journey Æther descendant');
  expect(topic.status).toBe(0);

  const listActive = () => run('materials/list-children');
  const findTrash = () => run('materials/list-trash', '--query', 'æther');
  expect((await listActive()).output.children).toContainEqual(expect.objectContaining({ id: folderId }));
  expect(await findTrash()).toEqual({ status: 0, output: { results: [], next_offset: null } });
  const childId = topic.output.material.id;
  if (source === 'desktop') {
    await expect.poll(() => desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug?.getNode(id)?.trashed, childId))
      .toBe(false);
    await desktopWindow.evaluate(async (id) => window.__folioleWorkspaceDebug!.deleteNode(id), folderId);
  } else {
    expect(await run('materials/delete-soft', '--id', folderId)).toMatchObject({ status: 0 });
  }
  expect((await listActive()).output.children).not.toContainEqual(expect.objectContaining({ id: folderId }));

  const found = await findTrash();
  expect(found).toEqual({ status: 0, output: {
    results: [expect.objectContaining({ id: folderId, kind: 'folder', updated_at: expect.any(String) })],
    next_offset: null
  } });
  const { id, updated_at } = found.output.results[0];
  expect(await run('materials/restore', '--id', id, '--expected-updated-at', updated_at))
    .toMatchObject({ status: 0, output: { restored_ids: expect.arrayContaining(source === 'desktop' ? [folderId, childId] : [folderId]) } });
  expect((await listActive()).output.children).toContainEqual(expect.objectContaining({ id: folderId }));
  expect(await run('materials/list-children', '--parent-id', folderId)).toMatchObject({
    status: 0, output: { children: [expect.objectContaining({ id: childId })] }
  });
  expect(await findTrash()).toEqual({ status: 0, output: { results: [], next_offset: null } });
}
