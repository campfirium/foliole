import path from 'node:path';

import { runAgentCli } from '../../scripts/agent-control/foliole-agent.mjs';

import { expect, test } from './harness/fixtures';
import { openSettingsCategory } from './harness/settings';

test('requires local permission to import a Topic reading schedule', async ({ desktopApp, desktopWindow }) => {
  const userDataPath = await desktopApp.evaluate(({ app }) => app.getPath('userData'));
  const args = ['materials/create', '--descriptor', path.join(userDataPath, 'cache', 'agent-control-session.json'),
    '--kind', 'topic', '--title', 'Migrated Topic', '--content', 'Imported content', '--reading-schedule',
    JSON.stringify({ priority: 2, next_at: '2027-02-01T00:00:00Z', last_handled_at: '2026-11-01T00:00:00Z',
      interval_duration_ms: 7948800000, interval_growth_factor: 1.5, repetition_count: 6 })];

  const settings = await openSettingsCategory(desktopWindow, 'General');
  const permission = settings.getByRole('switch', { name: /^(Allow learning progress imports|允许导入学习进度)$/u });
  await expect(permission).toBeEnabled();
  await expect(permission).not.toBeChecked();
  expect(await runAgentCli(args)).toMatchObject({ output: { error: 'learning_import_disabled' }, status: 1 });

  await permission.click();
  await expect(permission).toBeChecked();
  expect(await runAgentCli(args)).toMatchObject({ output: { material: { title: 'Migrated Topic' } }, status: 0 });

  await permission.click();
  await expect(permission).not.toBeChecked();
  expect(await runAgentCli(args)).toMatchObject({ output: { error: 'learning_import_disabled' }, status: 1 });
});
