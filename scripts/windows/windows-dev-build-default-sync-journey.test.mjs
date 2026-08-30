// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { runWindowsDevBuild } from './windows-dev-build.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

it('builds desktop output before the journey without requiring Android signing material', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-default-sync-build-'));
  roots.push(repoRoot);
  const paths = {
    repoRoot,
    systemNode: path.join(repoRoot, 'node.exe'), systemNpmCli: path.join(repoRoot, 'npm-cli.js')
  };
  for (const name of [paths.systemNode, paths.systemNpmCli]) fs.writeFileSync(name, 'tool');
  const order = [];
  const calls = [];
  const execute = vi.fn(async (command, args) => {
    order.push('execute');
    calls.push({ args, command });
    if (command === 'powershell.exe') return result('[]');
    return result('built');
  });
  const runRouteControl = vi.fn(async () => {
    order.push('journey');
    return { output: 'journey passed\n' };
  });
  const run = await runWindowsDevBuild({ action: 'default-sync-journey', execute,
    paths, platform: 'win32', runRouteControl });

  expect(run).toMatchObject({ exitCode: 0, summary: {
    action: 'default-sync-journey', resultStatus: 'success', signingSha256: null
  } });
  expect(run.summary).not.toHaveProperty('sourceRevision');
  expect(calls.filter(({ command }) => command === paths.systemNode)
    .map(({ args }) => args.slice(-2))).toEqual([
    ['run', 'build'], ['run', 'electron:compile']
  ]);
  expect(order.at(-1)).toBe('journey');
});

it('keeps the ordinary journey out of the source-pulling remote wrapper', () => {
  const wrapper = fs.readFileSync('scripts/windows/windows-dev-action.ps1', 'utf8');
  const rejection = wrapper.indexOf('Run default-sync-journey directly');
  const pull = wrapper.indexOf('& $systemNode $puller');
  expect(rejection).toBeGreaterThan(-1);
  expect(rejection).toBeLessThan(pull);
});

function result(stdout) {
  return { code: 0, lines: [stdout], output: `${stdout}\n`, stderr: '', stdout: `${stdout}\n` };
}
