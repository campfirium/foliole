// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import process from 'node:process';
import { expect, it } from 'vitest';

it.each([undefined, 64])('bounds adversarial pattern expansion at the documented limit %s', cap => {
  const require = createRequire(import.meta.url);
  const builder = createRequire(require.resolve('electron-builder/package.json'));
  const consumer = builder.resolve('app-builder-lib');
  const source = `
    const { createRequire } = require('node:module');
    const { Minimatch } = createRequire(process.argv[1])('minimatch');
    const options = { optimizationLevel: 2, ...${JSON.stringify(cap ? { braceExpandMax: cap } : {})} };
    const matcher = new Minimatch('a/' + '**/../b/c/'.repeat(20) + 'target', options);
    process.stdout.write(JSON.stringify({ expanded: matcher.set.length, match: matcher.match('a/target') }));
  `;
  // The upstream default allows 100000 patterns; 64 MiB is not its memory contract.
  const result = spawnSync(process.execPath, ['--max-old-space-size=512', '-e', source, consumer], {
    encoding: 'utf8', timeout: 10000, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  });
  expect({ status: result.status, signal: result.signal, error: result.error?.code }).toEqual({ status: 0, signal: null, error: undefined });
  const observation = JSON.parse(result.stdout);
  expect(observation.expanded).toBeGreaterThan(0);
  expect(observation.expanded).toBeLessThanOrEqual(cap ?? 100000);
  expect(observation.match).toBe(false);
}, 15000);
