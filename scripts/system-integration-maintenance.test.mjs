import path from 'node:path';

import { expect, it } from 'vitest';

import { maintenanceExitCode, maintenanceSteps, parseMaintenanceArgs } from './system-integration-maintenance-plan.mjs';

it('selects an explicit affected domain without running other product domains', () => {
  const options = parseMaintenanceArgs(['--scope', 'reading', '--id', 'reading-283']);
  const steps = maintenanceSteps(options.scope, '/isolated-output');
  expect(steps.map((step) => step.name)).toEqual(['reading']);
  expect(steps[0].args.slice(0, 3)).toEqual(['run', 'test:sqlite:electron', '--']);
});

it('runs core plus the full two-path synchronization regression for full maintenance', () => {
  const outputRoot = path.resolve('isolated-output');
  const steps = maintenanceSteps(parseMaintenanceArgs([]).scope, outputRoot);
  expect(steps.map((step) => step.name)).toEqual(['journey', 'editing', 'reading', 'review', 'search', 'import', 'sync']);
  const sync = steps.at(-1);
  expect(sync.args).toContain('both');
  expect(sync.args).not.toContain('--scenarios');
  expect(sync.args).not.toContain('--database');
  expect(path.relative(outputRoot, sync.args.at(-1))).toBe('sync');
});

it('rejects path traversal, unknown scope and missing arguments before executing', () => {
  for (const args of [['--id', '../data'], ['--id', '/library'], ['--scope', 'unknown'], ['--scope']]) {
    expect(() => parseMaintenanceArgs(args)).toThrow();
  }
});

it('keeps failures and unstable candidate evidence nonzero', () => {
  expect(maintenanceExitCode([{ exitCode: 0 }, { exitCode: 1 }], true)).toBe(1);
  expect(maintenanceExitCode([{ exitCode: 0 }], false)).toBe(1);
  expect(maintenanceExitCode([], true)).toBe(1);
  expect(maintenanceExitCode([{ exitCode: 0 }], true)).toBe(0);
});
