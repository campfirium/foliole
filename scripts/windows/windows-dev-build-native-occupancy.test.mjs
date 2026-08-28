// @vitest-environment node
/* global process */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, it } from 'vitest';

it('does not load node_modules native binaries before fixed runtime preparation', () => {
  const repoRoot = path.resolve(import.meta.dirname, '../..');
  const script = "await import('./scripts/windows/windows-dev-build.mjs');"
    + ' process.stdout.write(JSON.stringify(process.report.getReport().sharedObjects));';
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: repoRoot, encoding: 'utf8'
  });
  const loaded = JSON.parse(output).filter((filePath) =>
    filePath.includes('node_modules') && filePath.toLowerCase().endsWith('.node'));
  expect(loaded).toEqual([]);
});
