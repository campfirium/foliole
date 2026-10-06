import { expect, it } from 'vitest';

import { maintenanceExitCode, maintenanceSteps, parseMaintenanceArgs } from './system-integration-maintenance-plan.mjs';

it('selects an explicit affected domain without running other product domains', () => {
  const options = parseMaintenanceArgs(['--scope', 'reading', '--id', 'reading-283']);
  const steps = maintenanceSteps(options.scope);
  expect(steps.map((step) => step.name)).toEqual(['reading']);
  expect(steps[0].args.slice(0, 3)).toEqual(['run', 'test:sqlite:electron', '--']);
});

it('runs the current framed production boundary instead of the legacy simulator', () => {
  const steps = maintenanceSteps(parseMaintenanceArgs([]).scope);
  expect(steps.map((step) => step.name)).toEqual([
    'journey', 'editing', 'reading', 'review', 'search', 'import', 'search-ui',
    'sync-framed', 'sync-framed-cross-host'
  ]);
  const sync = steps.at(-2);
  expect(sync.args.slice(0, 3)).toEqual(['run', 'test:sqlite:electron', '--']);
  expect(sync.args).toContain('electron/sync/desktopFramedSyncTwoProcess.integration.test.ts');
  expect(sync.args).toContain('electron/sync/desktopFramedSyncTwoProcessRecovery.integration.test.ts');
  expect(sync.args).toContain(
    'src/shared/platform/companion/sync/framed/companionFramedSyncInventoryRound.test.ts'
  );
  expect(sync.args).not.toContain('sync:simulate');
  expect(steps.at(-1)).toMatchObject({
    args: ['run', 'sync:framed:cross-host'], name: 'sync-framed-cross-host', report: null
  });
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
