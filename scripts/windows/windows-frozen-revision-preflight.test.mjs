// @vitest-environment node

import path from 'node:path';
import { expect, it } from 'vitest';

import {
  windowsFrozenPreflightCommands, windowsFrozenPreflightPaths
} from './windows-frozen-revision-preflight.mjs';

it('routes dependency and native work into a unique disposable Windows task copy', () => {
  const paths = { capsulesRoot: 'C:\\state\\capsules', systemNode: 'C:\\node.exe',
    systemNpmCli: 'C:\\npm-cli.js' };
  const first = windowsFrozenPreflightPaths(paths, 'a'.repeat(40),
    '20260828T010203456-12345678', 'D:\\evidence\\one');
  const second = windowsFrozenPreflightPaths(paths, 'a'.repeat(40),
    '20260828T010203457-87654321', 'D:\\evidence\\two');
  expect(first.taskRoot).not.toBe(second.taskRoot);
  expect(first.sourceRoot).not.toBe('D:\\C\\foliole');
  expect(first.logPath).toBe(path.join('D:\\evidence\\one', 'action.log'));
});

it('uses absolute system Node for npm ci, build, and native health in the task copy', () => {
  const paths = { systemNode: 'C:\\node.exe', systemNpmCli: 'C:\\npm-cli.js' };
  const commands = windowsFrozenPreflightCommands('C:\\owned\\source', paths);
  expect(commands.map(({ args, stage }) => [stage, args.join(' ')])).toEqual([
    ['dependencies', 'C:\\npm-cli.js ci'],
    ['build', 'C:\\npm-cli.js run build'],
    ['native-health', 'C:\\npm-cli.js run electron:native:health']
  ]);
  expect(commands.every(({ bin, cwd }) => bin === paths.systemNode && cwd === 'C:\\owned\\source')).toBe(true);
});
