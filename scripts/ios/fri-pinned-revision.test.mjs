// @vitest-environment node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { assertFriPinnedRevision, writeFriPinnedRevision } from './fri-pinned-revision.mjs';
import { runFriDevWorkflow } from './fri-dev-workflow.mjs';

const roots = [];

function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fri-pinned-revision-'));
  roots.push(root);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const commit = (message) => git('-c', 'user.name=Test', '-c', 'user.email=test@example.com',
    'commit', '-q', '--allow-empty', '-m', message);
  git('init', '-q', '-b', 'release');
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'candidate');
  git('add', 'tracked.txt');
  commit('candidate');
  return { git, commit, root, revision: git('rev-parse', 'HEAD') };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.promises.rm(root, { force: true, recursive: true })));
});

it('accepts a clean checkout at the requested commit and records its tree', () => {
  const { git, root, revision } = repository();
  fs.writeFileSync(path.join(root, 'untracked.txt'), 'local note');
  const pinned = assertFriPinnedRevision(root, revision);
  expect(pinned).toEqual({ revision, tree: git('rev-parse', 'HEAD^{tree}') });
  const target = writeFriPinnedRevision(root, pinned);
  expect(JSON.parse(fs.readFileSync(target, 'utf8'))).toMatchObject({ schemaVersion: 1, revision });
});

it('rejects a short SHA, tracked edits, and a checkout at another commit', () => {
  const { commit, root, revision } = repository();
  expect(() => assertFriPinnedRevision(root, revision.slice(0, 12))).toThrow('full SHA');
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'edited');
  expect(() => assertFriPinnedRevision(root, revision)).toThrow('clean tracked worktree');
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'candidate');
  commit('later');
  expect(() => assertFriPinnedRevision(root, revision)).toThrow('HEAD to equal');
});

it('checks the pinned commit before building and again after the device run', async () => {
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fri-pinned-workflow-'));
  roots.push(evidenceRoot);
  const stages = [];
  const revision = 'a'.repeat(40);
  const result = await runFriDevWorkflow({
    evidenceRoot, repoRoot: '/repo', revision, runnerPath: '/bin/sh',
    readiness: async () => { stages.push('readiness'); },
    retention: async () => { stages.push('fri-app-retention'); },
    revisionCheck: (_root, value) => { stages.push('revision-check'); return { revision: value, tree: 'b'.repeat(40) }; },
    run: (_command, _args, options) => { stages.push(options.stage); }
  });
  expect(stages[0]).toBe('revision-check');
  expect(stages.at(-1)).toBe('revision-check');
  expect(result.revision).toBe(revision);
  expect(fs.existsSync(path.join(evidenceRoot, 'pinned-revision.json'))).toBe(true);
});

it('refuses an empty pinned revision instead of silently building the current checkout', async () => {
  const stages = [];
  await expect(runFriDevWorkflow({
    evidenceRoot: '/unused', repoRoot: '/repo', revision: '', runnerPath: '/bin/sh',
    run: (_command, _args, options) => { stages.push(options.stage); }
  })).rejects.toThrow('full SHA');
  expect(stages).toEqual([]);
});
