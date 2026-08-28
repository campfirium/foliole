// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';

import {
  assertWindowsDesktopDnsSdFixedRuntime, fixedRuntimeCommands, fixedRuntimePaths,
  prepareWindowsDesktopDnsSdFixedRuntime
} from './windows-desktop-dnssd-fixed-runtime.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixed-dnssd-runtime-'));
  const repoRoot = path.join(root, 'repo');
  const evidenceRoot = path.join(repoRoot, '.tmp', 'evidence');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'package-lock.json'), '{}');
  return { evidenceRoot, paths: { gitPath: 'git.exe', repoRoot,
    systemNode: 'node.exe', systemNpmCli: 'npm-cli.js' }, root };
}

function successfulExecute(stages) {
  return vi.fn(async (command, args) => {
    if (command === 'git.exe') {
      const request = args.slice(2).join(' ');
      const values = { 'branch --show-current': 'dev', 'rev-parse HEAD': 'revision-1',
        'rev-parse origin/dev': 'revision-1', 'rev-parse HEAD^{tree}': 'tree-1',
        'status --porcelain --untracked-files=all': '' };
      return { code: 0, output: `${values[request]}\n`, stderr: '', stdout: `${values[request]}\n` };
    }
    stages.push({ args, command });
    return { code: 0, output: 'ok\n', stderr: '', stdout: 'ok\n' };
  });
}

it('prepares the fixed repository once and records the accepted source identity', async () => {
  const { evidenceRoot, paths, root } = fixture();
  const stages = [];
  const execute = successfulExecute(stages);
  const result = await prepareWindowsDesktopDnsSdFixedRuntime({
    buildIdentity: 'run-1', evidenceRoot, execute, paths
  });
  const marker = JSON.parse(fs.readFileSync(fixedRuntimePaths(paths).markerPath, 'utf8'));
  expect(result.desktopDnsSdRoutePrepare.manifestPath).toContain('prepare-receipt.json');
  expect(marker).toMatchObject({ buildIdentity: 'run-1', resultStatus: 'success',
    source: { revision: 'revision-1', tree: 'tree-1' } });
  expect(stages).toHaveLength(fixedRuntimeCommands(paths).length);
  expect(stages.map(({ args }) => args.join(' '))).toContain('npm-cli.js ci');
  fs.rmSync(root, { force: true, recursive: true });
});

it('accepts only a prepared runtime with matching source and required launch files', async () => {
  const { paths, root } = fixture();
  const execute = successfulExecute([]);
  const source = { lockfileDigest:
      '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
    revision: 'revision-1', tree: 'tree-1' };
  const markerPath = fixedRuntimePaths(paths).markerPath;
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.mkdirSync(path.join(paths.repoRoot, 'dist', 'electron'), { recursive: true });
  fs.mkdirSync(path.join(paths.repoRoot, 'node_modules', 'electron', 'dist'), { recursive: true });
  fs.writeFileSync(path.join(paths.repoRoot, 'dist', 'electron', 'main.js'), 'main');
  fs.writeFileSync(path.join(paths.repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe'), 'exe');
  fs.writeFileSync(markerPath, JSON.stringify({ resultStatus: 'success', source }));
  await expect(assertWindowsDesktopDnsSdFixedRuntime({ execute, paths }))
    .resolves.toMatchObject({ source });
  fs.writeFileSync(path.join(paths.repoRoot, 'package-lock.json'), '{"changed":true}');
  await expect(assertWindowsDesktopDnsSdFixedRuntime({ execute, paths }))
    .rejects.toMatchObject({ stage: 'runtime-marker' });
  fs.rmSync(root, { force: true, recursive: true });
});
