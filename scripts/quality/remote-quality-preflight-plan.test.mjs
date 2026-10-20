// @vitest-environment node

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

import { planPreflightSelection } from './remote-quality-preflight-plan.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-plan-'));
  roots.push(root);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  const commit = () => { git('add', '-A'); git('commit', '-qm', 'c'); return git('rev-parse', 'HEAD'); };
  return { commit, root, write };
}

const runner = async (command, args, { cwd }) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  return { code: result.status, stderr: result.stderr, stdout: result.stdout };
};

it('selects from the committed head rather than the working tree', async () => {
  const { commit, root, write } = repo();
  write('src/feature-module.mjs', 'export const a = 1;\n');
  write('src/other.test.mjs', "import './feature-module.mjs';\n");
  write('src/unrelated.test.mjs', 'export {};\n');
  const base = commit();
  write('src/feature-module.mjs', 'export const a = 2;\n');
  const head = commit();
  write('src/unrelated.test.mjs', "import './feature-module.mjs';\n");

  const committed = await planPreflightSelection({ base, cwd: root, head, revision: true, runner });
  expect(committed.run.map(({ file }) => file)).toEqual(['src/other.test.mjs']);
  const worktree = await planPreflightSelection({ base, cwd: root, head, runner });
  expect(worktree.run.map(({ file }) => file)).toEqual(['src/other.test.mjs', 'src/unrelated.test.mjs']);
});

it('applies the same cap on every host', async () => {
  const { commit, write, root } = repo();
  write('src/feature-module.mjs', 'export const a = 1;\n');
  for (const name of ['a', 'b', 'c']) write(`src/${name}.test.mjs`, "import './feature-module.mjs';\n");
  const base = commit();
  write('src/feature-module.mjs', 'export const a = 2;\n');
  const head = commit();
  const plan = await planPreflightSelection({ base, cap: 2, cwd: root, head, revision: true, runner });
  expect(plan.run.map(({ file }) => file)).toEqual(['src/a.test.mjs', 'src/b.test.mjs']);
  expect(plan.deferred.map(({ file }) => file)).toEqual(['src/c.test.mjs']);
});
