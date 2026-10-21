// @vitest-environment node
/* global process */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, expect, it } from 'vitest';

import { applyHangCap, HANG_CAP_MS } from './vitest-soft-timeouts.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER = path.join(REPO_ROOT, 'scripts/run-vitest-with-summary.mjs');
let root;

afterEach(() => { if (root) rmSync(root, { force: true, recursive: true }); });

function runFixture(source) {
  mkdirSync(path.join(REPO_ROOT, '.tmp'), { recursive: true });
  root = mkdtempSync(path.join(REPO_ROOT, '.tmp', 'vitest-soft-timeouts-'));
  writeFileSync(path.join(root, 'fixture.test.mjs'), source);
  const report = path.join(root, 'report.json');
  const result = spawnSync(process.execPath, [RUNNER, report, '--', '--testTimeout=30000', 'fixture.test.mjs'], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, GITHUB_STEP_SUMMARY: '', VITEST_BIN: path.join(REPO_ROOT, 'node_modules/vitest/vitest.mjs') }
  });
  const rerun = path.join(root, 'report.rerun.json');
  const titles = (file) => {
    try {
      return JSON.parse(readFileSync(file, 'utf8')).testResults.flatMap((entry) => entry.assertionResults
        .filter((a) => a.status !== 'skipped').map((a) => a.title));
    } catch { return null; }
  };
  return { code: result.status, output: `${result.stdout}${result.stderr}`, rerunTitles: titles(rerun) };
}

const marker = "const marker = new URL('./marker', import.meta.url);";

it('replaces every runner time limit with the hang cap and keeps the old default as calibration', () => {
  expect(applyHangCap(['--testTimeout=30000', '--hookTimeout', '45000', 'src'])).toEqual({
    args: ['src', `--testTimeout=${HANG_CAP_MS}`, `--hookTimeout=${HANG_CAP_MS}`], calibratedDefaultMs: 30000
  });
});

it('only warns about a test slower than its calibration and reruns that test alone', () => {
  const result = runFixture(`import { it } from 'vitest';
it('slow', { meta: { calibratedMs: 20 } }, async () => { await new Promise((r) => setTimeout(r, 150)); });
it('fast', () => {});`);
  expect(result.code).toBe(0);
  expect(result.output).toContain('::warning::Slower than calibrated:');
  expect(result.output).toContain('Slower than calibrated twice; review locally on the same platform');
  expect(result.rerunTitles).toEqual(['slow']);
});

it('passes a timed-out test that passes on its single rerun, with a warning', () => {
  const result = runFixture(`import { existsSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
${marker}
it('flaky', () => {
  if (!existsSync(marker)) { writeFileSync(marker, ''); throw new Error('Discovery request timed out.'); }
});`);
  expect(result.code).toBe(0);
  expect(result.output).toContain('::warning::Timed-out tests passed only on their single rerun');
});

it('fails a test that times out twice', () => {
  const result = runFixture(`import { it } from 'vitest';
it('stuck', () => { throw new Error('request timed out'); });`);
  expect(result.code).toBe(1);
  expect(result.output).toContain('::error::Tests failed twice; reproduce locally on the same platform');
});

it('fails an ordinary assertion at once without a rerun', () => {
  const result = runFixture(`import { expect, it } from 'vitest';
it('wrong', () => { expect(1).toBe(2); });`);
  expect(result.code).toBe(1);
  expect(result.rerunTitles).toBeNull();
  expect(result.output).not.toContain('rerunning');
});
