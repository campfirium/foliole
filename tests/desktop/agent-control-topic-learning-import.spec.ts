import path from 'node:path';

import { runAgentCli } from '../../scripts/agent-control/foliole-agent.mjs';

import { expect, test } from './harness/fixtures';
import { openSettingsCategory } from './harness/settings';

test('requires local permission to import Topic and Item schedules', async ({ desktopApp, desktopWindow }) => {
  const userDataPath = await desktopApp.evaluate(({ app }) => app.getPath('userData'));
  const args = ['materials/create', '--descriptor', path.join(userDataPath, 'cache', 'agent-control-session.json'),
    '--kind', 'topic', '--title', 'Migrated Topic', '--content', 'Imported content', '--reading-schedule',
    JSON.stringify({ priority: 2, next_at: '2027-02-01T00:00:00Z', last_handled_at: '2026-11-01T00:00:00Z',
      interval_duration_ms: 7948800000, interval_growth_factor: 1.5, repetition_count: 6 })];

  const itemArgs = ['materials/create', '--descriptor', path.join(userDataPath, 'cache', 'agent-control-session.json'),
    '--kind', 'item', '--content', 'Imported question', '--reveal', 'Imported answer', '--review-schedule',
    JSON.stringify({ due: '2027-02-01T00:00:00Z', priority: 2 })];

  const settings = await openSettingsCategory(desktopWindow, 'General');
  const permission = settings.getByRole('switch', { name: /^(Allow learning progress imports|允许导入学习进度)$/u });
  await expect(permission).toBeEnabled();
  await expect(permission).not.toBeChecked();
  expect(await runAgentCli(args)).toMatchObject({ output: { error: 'learning_import_disabled' }, status: 1 });

  expect(await runAgentCli(itemArgs)).toMatchObject({ output: { error: 'learning_import_disabled' }, status: 1 });

  await permission.click();
  await expect(permission).toBeChecked();
  const topic = await runAgentCli(args);
  expect(topic).toMatchObject({ output: { material: { title: 'Migrated Topic' } }, status: 0 });

  expect(await runAgentCli(itemArgs)).toMatchObject({ output: { material: { kind: 'item' } }, status: 0 });

  await permission.click();
  await expect(permission).not.toBeChecked();
  expect(await runAgentCli(args)).toMatchObject({ output: { error: 'learning_import_disabled' }, status: 1 });
  expect(await runAgentCli(['materials/read', '--descriptor', args[2], '--id', topic.output.material.id,
    '--include-learning', 'true'])).toMatchObject({ status: 0, output: { material: { learning: {
      priority: 2, reading_schedule: { next_at: '2027-02-01T00:00:00.000Z', repetition_count: 6 }
    } } } });
});
