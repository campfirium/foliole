// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parse } from 'yaml';
import { selectDesktopTimeout } from './retry-desktop-test-file.mjs';

const file = 'src/app/example.test.ts';
const timeout = { file, platform: 'linux', status: 'timeout', timeoutMs: 120_000 };
const workflow = name => parse(readFileSync(`.github/workflows/${name}.yml`, 'utf8'));

it('requires evidence of an original timeout for a covered file on the same platform', () => {
  expect(selectDesktopTimeout([timeout], file, 'linux', [file])).toEqual(timeout);
  expect(() => selectDesktopTimeout([timeout], file, 'win32', [file])).toThrow();
  expect(() => selectDesktopTimeout([timeout], file, 'linux', [])).toThrow();
  expect(() => selectDesktopTimeout([{ ...timeout, status: 'failed' }], file, 'linux', [file])).toThrow();
  expect(() => selectDesktopTimeout([timeout, timeout], file, 'linux', [file])).toThrow();
});

it('routes isolated retry evidence outside full quality admission and its cancellation group', () => {
  const remote = workflow('remote-quality');
  const retry = workflow('hosted-quality-desktop-file-retry').jobs.retry;
  expect(remote.jobs['desktop-file-retry'].uses).toBe('./.github/workflows/hosted-quality-desktop-file-retry.yml');
  expect(remote.jobs['scoped-quality'].if).toContain("inputs.scope != 'desktop-file-retry'");
  expect(remote.jobs['full-quality'].if).toContain("inputs.scope == 'full' || inputs.scope == 'replay'");
  expect(remote.concurrency.group).toContain('quality-desktop-file-retry-');
  expect(retry['runs-on']).toContain("'windows-latest' || 'ubuntu-latest'");
  expect(retry.steps.at(-1).with.name).toContain('desktop-retry-');
});
