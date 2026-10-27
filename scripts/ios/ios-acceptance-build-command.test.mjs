// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const { spawnSync } = vi.hoisted(() => ({ spawnSync: vi.fn() }));
vi.mock('node:child_process', async importOriginal => ({ ...await importOriginal(), spawnSync }));

import { runHeavy } from './ios-bootstrap-acceptance-attempt.mjs';
import { recoverableIosAcceptanceKind } from './ios-acceptance-infrastructure-error.mjs';

const options = { repoRoot: '/repo', resourceMode: 'full' };
beforeEach(() => spawnSync.mockReset());

it('lets a cold native build finish within its own bounded budget', () => {
  spawnSync.mockReturnValue({ status: 0 });
  runHeavy(options, 'xcodebuild', ['build']);
  expect(spawnSync).toHaveBeenLastCalledWith('xcodebuild', ['build'], expect.objectContaining({
    timeout: 30 * 60_000
  }));
  runHeavy(options, 'npm', ['run', 'android:web:build']);
  expect(spawnSync).toHaveBeenLastCalledWith('npm', ['run', 'android:web:build'], expect.objectContaining({
    timeout: 600_000
  }));
});

it('preserves a timed out build as recoverable infrastructure evidence', () => {
  const error = Object.assign(new Error('spawnSync xcodebuild ETIMEDOUT'), { code: 'ETIMEDOUT' });
  spawnSync.mockReturnValue({ status: null, signal: 'SIGTERM', error });
  let failure;
  try { runHeavy(options, 'xcodebuild', ['build']); } catch (caught) { failure = caught; }
  expect(failure?.message).toMatch(/xcodebuild.*timed out.*1800000.*SIGTERM/);
  expect(failure?.cause).toBe(error);
  expect(recoverableIosAcceptanceKind(failure)).toBe('timeout');
});

it('keeps compile failures decisive rather than retrying them as timeouts', () => {
  spawnSync.mockReturnValue({ status: 65, signal: null });
  expect(() => runHeavy(options, 'xcodebuild', ['build'])).toThrow('xcodebuild failed with 65');
  expect(recoverableIosAcceptanceKind(new Error('xcodebuild failed with 65'))).toBeNull();
});
