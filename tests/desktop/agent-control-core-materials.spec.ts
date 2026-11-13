import path from 'node:path';

import { runAgentCli } from '../../scripts/agent-control/foliole-agent.mjs';

import { expect, test } from './harness/fixtures';

test('writes long content, follows backlinks, and pages through search from the CLI', async ({ desktopApp }) => {
  const userData = await desktopApp.evaluate(({ app }) => app.getPath('userData'));
  const descriptor = path.join(userData, 'cache', 'agent-control-session.json');
  const run = (command: string, ...args: string[]) =>
    runAgentCli([command, '--descriptor', descriptor, ...args]);

  const title = 'Agent Control native reference';
  const create = (nodeTitle: string, content: string) =>
    run('materials/create', '--kind', 'topic', '--title', nodeTitle, '--content', content);
  const original = await create(title, 'agentcontrolreference');
  const referring = await create('Referring Topic', `agentcontrolreference [[${title}]]`);
  expect(original.status).toBe(0);
  expect(referring.status).toBe(0);
  const { id, updated_at } = original.output.material;
  const content = '长正文🌱\n'.repeat(6000) + 'agentcontrolreference';
  expect(await runAgentCli(['materials/update', '--descriptor', descriptor, '--id', id,
    '--expected-updated-at', updated_at, '--content-stdin', 'true'], { stdin: [Buffer.from(content)] }))
    .toMatchObject({ status: 0 });

  expect(await run('materials/read', '--id', id, '--content-mode', 'full', '--include-relations', 'true'))
    .toMatchObject({ status: 0, output: { material: { content, relations: {
      backlinks: [{ source_node_id: referring.output.material.id }]
    } } } });
  const search = (offset: string) => run('materials/search', '--query', 'agentcontrolreference',
    '--limit', '1', '--offset', offset);
  await expect.poll(async () => (await search('0')).output).toMatchObject({ next_offset: 1 });
  const first = await search('0');
  const last = await search('1');
  expect(last).toMatchObject({ status: 0, output: { next_offset: null } });
  expect(new Set([first.output.results[0].id, last.output.results[0].id]))
    .toEqual(new Set([id, referring.output.material.id]));
});
