import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('topic menu help explains that Dismiss and Relearn do not affect derived materials', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated?.());
  const nodeIds = await desktopWindow.evaluate(async () => {
    localStorage.setItem('foliole-app-language', 'en');
    const debug = window.__folioleWorkspaceDebug!;
    return [await debug.createRootNode('Help scope first', 'topic'),
      await debug.createRootNode('Help scope second', 'topic')];
  });
  await desktopWindow.reload();
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated?.());
  const first = desktopWindow.locator(`[role="treeitem"][data-node-id="${nodeIds[0]}"]`);
  const second = desktopWindow.locator(`[role="treeitem"][data-node-id="${nodeIds[1]}"]`);
  await first.click();
  await second.click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
  await first.click({ button: 'right' });

  const directory = path.resolve('.tmp/artifacts/D274');
  await mkdir(directory, { recursive: true });
  for (const action of ['Dismiss', 'Relearn']) {
    await desktopWindow.getByRole('menuitem', { name: action, exact: true }).hover();
    const tooltip = desktopWindow.getByRole('tooltip');
    await expect(tooltip).toContainText('Does not affect derived materials.');
    await expect(tooltip).toContainText(action === 'Dismiss'
      ? 'The topic is kept in Foliole and can still be opened manually.'
      : 'It can be studied again from the beginning.');
    const screenshot = path.join(directory, `${action.toLowerCase()}-help.png`);
    await desktopWindow.screenshot({ path: screenshot });
    await testInfo.attach(`${action} help scope`, { contentType: 'image/png', path: screenshot });
  }
});
