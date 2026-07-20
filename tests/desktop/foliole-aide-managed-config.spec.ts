import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';

test('creates the visible Foliole Aide definition and Skills directory', async ({
  desktopSession,
  desktopWindow
}) => {
  const status = await desktopWindow.evaluate(
    () => window.electronAPI?.invoke('assistant_get_status')
  );
  expect(status).toMatchObject({ provider: 'codex-app-server' });

  const aideRoot = path.join(
    desktopSession.target.runtimeStateRoot,
    'library',
    'Widgets',
    'Foliole Aide'
  );
  const agentsContent = await readFile(path.join(aideRoot, 'AGENTS.md'), 'utf8');
  expect(agentsContent).toContain('You are Foliole Aide');
  expect(agentsContent).toContain('Use Aide-specific custom skills only from the sibling Skills directory.');
  expect((await stat(path.join(aideRoot, 'Skills'))).isDirectory()).toBe(true);
});
