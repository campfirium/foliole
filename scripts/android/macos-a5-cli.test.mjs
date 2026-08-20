// @vitest-environment node
/* global console, process */

import { afterEach, expect, it, vi } from 'vitest';

import { runMacosA5Cli } from './macos-a5-cli.mjs';

afterEach(() => { process.exitCode = 0; vi.restoreAllMocks(); });

it('passes the formal candidate mode to the fixed action runner', async () => {
  const run = vi.fn();
  await runMacosA5Cli({
    argv: ['deploy', '--formal'], errorEvidence: vi.fn(), repoRoot: '/repo', run
  });
  expect(run).toHaveBeenCalledWith('deploy', '/repo', { formal: true });
});

it('returns CLI failures without running an invalid action', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const run = vi.fn();
  await runMacosA5Cli({ argv: [], errorEvidence: vi.fn(), repoRoot: '/repo', run });
  expect(run).not.toHaveBeenCalled();
  expect(error).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  expect(process.exitCode).toBe(1);
});
