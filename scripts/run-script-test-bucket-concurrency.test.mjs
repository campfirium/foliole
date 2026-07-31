// @vitest-environment node

import { expect, it } from 'vitest';

import { buildVitestArgs } from './run-script-test-bucket.mjs';

it('parallelizes only the oversized core file list without widening its worker count', () => {
  const coreArgs = buildVitestArgs('core', 'core.json', ['scripts/a.test.mjs']);
  const gateArgs = buildVitestArgs('gate', 'gate.json', ['scripts/quality/quality-a.test.mjs']);

  expect(coreArgs).toContain('--fileParallelism');
  expect(coreArgs).toContain('--maxWorkers=2');
  expect(gateArgs).toContain('--no-file-parallelism');
  expect(gateArgs).not.toContain('--fileParallelism');
});
