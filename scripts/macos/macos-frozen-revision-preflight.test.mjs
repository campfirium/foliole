// @vitest-environment node

import path from 'node:path';
import fs from 'node:fs';
import { expect, it } from 'vitest';

import {
  macosFrozenPreflightCommands, macosFrozenPreflightPaths
} from './macos-frozen-revision-preflight.mjs';

it('uses a unique task copy outside the active runtime and a matching evidence root', () => {
  const source = { revision: 'a'.repeat(40), tree: 'b'.repeat(40) };
  const first = macosFrozenPreflightPaths('/repo', source, '20260828T010203456-12345678');
  const second = macosFrozenPreflightPaths('/repo', source, '20260828T010203457-87654321');
  expect(first.taskRoot).not.toBe(second.taskRoot);
  expect(first.evidenceRoot).not.toBe(second.evidenceRoot);
  expect(first.sourceRoot).not.toBe('/repo');
  expect(first.evidenceRoot).toContain(path.join(source.revision, 'macos'));
});

it('builds, checks native health, and signs a development package in the task copy', () => {
  const commands = macosFrozenPreflightCommands('/owned/source');
  expect(commands.map(({ args, stage }) => [stage, args.join(' ')])).toEqual([
    ['dependencies', 'ci'], ['build', 'run build'],
    ['native-health', 'run electron:native:health'],
    ['package-sign', 'scripts/macos/package-mas.mjs']
  ]);
  expect(commands.every(({ cwd }) => cwd === '/owned/source')).toBe(true);
});

it('requires the node-heavy gate before creating a task copy', () => {
  const source = fs.readFileSync('scripts/macos/macos-frozen-revision-preflight.mjs', 'utf8');
  expect(source).toContain("includes('node-heavy')");
  expect(source).toContain("className: 'node-heavy'");
});
