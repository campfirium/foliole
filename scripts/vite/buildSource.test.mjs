// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { buildSourceDefines } from './buildSource.ts';

const suffixKey = 'import.meta.env.VITE_FOLIOLE_BUILD_REVISION_SUFFIX';
let root;
let revision;

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

beforeEach(() => {
  mkdirSync('.tmp/artifacts', { recursive: true });
  root = mkdtempSync(path.resolve('.tmp/artifacts/build-source-'));
  git('init', '-b', 'preview');
  git('-c', 'user.name=Foliole Test', '-c', 'user.email=test@example.com',
    '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'Preview source');
  revision = git('rev-parse', 'HEAD');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

it('identifies preview and local development builds by the source they were built from', () => {
  const suffix = `.${revision.slice(0, 8).toUpperCase()}`;
  expect(buildSourceDefines(root, false, {})[suffixKey]).toBe(JSON.stringify(suffix));
  git('switch', '-c', 'dev');
  writeFileSync(path.join(root, 'local.ts'), 'const local = true;');
  expect(buildSourceDefines(root, true, {})[suffixKey]).toBe(JSON.stringify(`${suffix}*`));
});

it('keeps release builds plain and identifies internal rebuilds of the same commit', () => {
  git('switch', '-c', 'release');
  expect(buildSourceDefines(root, false, {})[suffixKey]).toBe('""');
  git('tag', 'v0.8.2');
  git('switch', '--detach', 'HEAD');
  expect(buildSourceDefines(root, false, {})[suffixKey]).toBe('""');
  expect(buildSourceDefines(root, false, { GITHUB_REF: 'refs/heads/release' })[suffixKey]).toBe('""');
  const suffix = `.${revision.slice(0, 8).toUpperCase()}`;
  expect(buildSourceDefines(root, true, {})[suffixKey]).toBe(JSON.stringify(suffix));
  expect(buildSourceDefines(root, false, { GITHUB_REF: 'refs/heads/dev' })[suffixKey]).toBe(JSON.stringify(suffix));
});
