// @vitest-environment node
/* global process */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

import { routeRuntimeCommands } from './windows-desktop-dnssd-route-runtime.mjs';
import { cleanupWindowsFrozenTaskCopy } from './windows-frozen-task-copy.mjs';

it('builds dependencies, product output, Electron ABI, and DNS-SD probe in one runtime root', () => {
  const sourceRoot = 'C:\\state\\capsules\\attempt\\source';
  const paths = { systemNode: 'C:\\Program Files\\nodejs\\node.exe',
    systemNpmCli: 'C:\\Program Files\\nodejs\\npm-cli.js' };
  const commands = routeRuntimeCommands(sourceRoot, paths);
  expect(commands.map(({ stage }) => stage)).toEqual([
    'dependencies', 'electron-runtime', 'build', 'native-rebuild', 'native-probe'
  ]);
  expect(commands.every(({ cwd }) => cwd === sourceRoot)).toBe(true);
  expect(commands.at(-1).bin).toBe(path.join(sourceRoot,
    'node_modules', 'electron', 'dist', 'electron.exe'));
});

it('cleans only a task copy owned by the current controller process', () => {
  const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'route-runtime-owner-'));
  const ownerPath = path.join(taskRoot, 'owner.json');
  const taskCopy = { attemptId: 'attempt-1', ownerPath,
    source: { revision: 'a'.repeat(40) }, taskRoot };
  fs.writeFileSync(ownerPath, JSON.stringify({ attemptId: taskCopy.attemptId,
    pid: process.pid, revision: taskCopy.source.revision }));
  expect(cleanupWindowsFrozenTaskCopy(taskCopy)).toMatchObject({ resultStatus: 'complete' });
  expect(fs.existsSync(taskRoot)).toBe(false);
});
