import { expect, it } from 'vitest';

import { runTask3Stage } from './t121-task3-stage.mjs';

it('reports each host stage and its measured duration', async () => {
  const output = [];
  const times = [1_000, 3_500];
  const result = await runTask3Stage({ label: 'windows-baseline-reset',
    now: () => times.shift(), run: async () => 'done', write: (value) => output.push(value) });
  expect(result).toBe('done');
  expect(output).toEqual([
    '[t121-task3] stage=windows-baseline-reset status=started\n',
    '[t121-task3] stage=windows-baseline-reset status=completed durationMs=2500\n'
  ]);
});
