// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { expect, it, vi } from 'vitest';
import { runHostedQualityBucket } from './hosted-quality-bucket.mjs';

it('retains a passing file and runs a later assertion after a file blocks the worker', () => {
  const repo = process.cwd();
  const fixture = mkdtempSync(path.join(tmpdir(), 'desktop-file-timeout-'));
  try {
    mkdirSync(path.join(fixture, 'src/app'), { recursive: true });
    mkdirSync(path.join(fixture, 'src/test'));
    for (const dir of ['node_modules', 'scripts']) {
      symlinkSync(path.join(repo, dir), path.join(fixture, dir), 'junction');
    }
    for (const [file, body] of [
      ['a', 'expect(1).toBe(1)'],
      ['b', 'for (;;) {}'],
      ['c', 'expect(1).toBe(2)']
    ]) {
      writeFileSync(path.join(fixture, 'src/app', `${file}.test.mjs`),
        `import { expect, it } from 'vitest'; it('${file}', () => { ${body} });`);
    }
    // The production collector always includes these two startup files.
    for (const name of ['startupBootstrap', 'startupViewMode']) {
      writeFileSync(path.join(fixture, 'src', `${name}.test.ts`), "import { it } from 'vitest'; it('startup', () => {});");
    }
    const runner = pathToFileURL(path.join(repo, 'scripts/run-release-desktop-source-test-bucket.mjs'));
    expect(() => execFileSync(process.execPath, ['--input-type=module', '-e',
      `import { runDesktopSourceTests } from '${runner}'; process.exitCode = await runDesktopSourceTests(['.tmp/report.json', 'one'], { timeoutMs: 4000 });`
    ], { cwd: fixture, env: { ...process.env, GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/check' },
      timeout: 25000, stdio: 'pipe' })).toThrow(expect.objectContaining({ status: 1 }));
    const read = name => JSON.parse(readFileSync(path.join(fixture, name), 'utf8'));
    const reports = [1, 2, 3].map(index =>
      read(`.tmp/vitest/release-desktop-src-app-01-file-${index}.json.execution.json`));
    expect(reports.map(report => report.status)).toEqual(['passed', 'timeout', 'failed']);
    expect(read('.tmp/report.json').testResults.at(-1).assertionResults[0].failureMessages.join(' '))
      .toContain('expected 1 to be 2');
    const history = path.join(fixture, 'history');
    for (const run of [1, 2]) {
      const dir = path.join(history, String(run), 'desktop-source-host-one-sha-1');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'file.execution.json'), JSON.stringify({
        file: 'src/app/a.test.mjs', platform: process.platform, durationMs: run * 1000, status: 'passed'
      }));
    }
    for (const name of ['b', 'c']) rmSync(path.join(fixture, `src/app/${name}.test.mjs`));
    execFileSync(process.execPath, ['--input-type=module', '-e',
      `import { runDesktopSourceTests } from '${runner}'; process.exitCode = await runDesktopSourceTests(['.tmp/report.json', 'one']);`
    ], { cwd: fixture, env: { ...process.env, GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/check',
      FOLIOLE_DESKTOP_TIMEOUT_HISTORY: history }, timeout: 25000, stdio: 'pipe' });
    expect(read('.tmp/vitest/release-desktop-src-app-01-file-1.json.execution.json').timeoutMs).toBe(120_000);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}, 30000);

it('continues the check job after a shard fails and returns failure', () => {
  vi.stubEnv('GITHUB_ACTIONS', 'true');
  vi.stubEnv('GITHUB_REF', 'refs/heads/check');
  try {
    const executed = [];
    expect(() => runHostedQualityBucket('desktop-source', '["one","two"]', (_definition, item) => {
      executed.push(item);
      if (item === 'one') throw new Error('one failed');
    })).toThrow('one failed');
    expect(executed).toEqual(['one', 'two']);
  } finally {
    vi.unstubAllEnvs();
  }
});
