// @vitest-environment node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, expect, it } from 'vitest';

import { assertPushedPreflightTarget } from './remote-quality-pushed-target.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-pushed-target-'));
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
git('init', '--quiet');
function commit(message) {
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', message);
  return git('rev-parse', 'HEAD');
}
const pushed = commit('pushed');
git('update-ref', 'refs/remotes/origin/dev', pushed);
const local = commit('local only');
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

it('accepts a commit reachable from the pushed dev ref', () => {
  expect(assertPushedPreflightTarget(root, pushed)).toBe(pushed);
});

it('refuses a local commit newer than the pushed dev ref', () => {
  expect(() => assertPushedPreflightTarget(root, local)).toThrow('not on pushed origin/dev');
});

it('refuses an unknown commit', () => {
  expect(() => assertPushedPreflightTarget(root, 'f'.repeat(40))).toThrow('not a local commit');
});

it('requires a full commit identity', () => {
  expect(() => assertPushedPreflightTarget(root, pushed.slice(0, 9))).toThrow('full SHA');
});
