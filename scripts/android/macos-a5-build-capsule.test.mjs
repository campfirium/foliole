// @vitest-environment node
/* global process */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import {
  closeMacosA5BuildCapsule, openMacosA5BuildCapsule
} from './macos-a5-build-capsule.mjs';
import { createMacosA5ExecutionContext } from './macos-a5-execution-context.mjs';
import { beginFormalA5Candidate } from './macos-a5-formal-candidate.mjs';

const roots = [];

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function fixture() {
  const parent = path.join(process.cwd(), '.tmp/artifacts');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'macos-a5-capsule-'));
  roots.push(root);
  git(root, ['init', '-b', 'dev']);
  git(root, ['config', 'user.email', 'capsule@example.invalid']);
  git(root, ['config', 'user.name', 'Capsule Test']);
  fs.writeFileSync(path.join(root, '.gitignore'), 'ignored.txt\n');
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'committed\n');
  fs.writeFileSync(path.join(root, 'package.json'), '{}\n');
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'fixture']);
  return root;
}

function context(root, candidate, runId = '66666666-6666-6666-6666-666666666666') {
  return createMacosA5ExecutionContext({ acceptedRevision: candidate.revision,
    acceptedTree: candidate.tree, action: 'build', formalSourceClass: 'frozen-build',
    repoRoot: root, runId });
}

function runner(events, failNpm = false) {
  return (command, args, options) => {
    events.push({ args, command, cwd: options.cwd });
    if (command === 'npm') {
      if (failNpm) throw new Error('npm ci failed');
      fs.mkdirSync(path.join(options.cwd, 'node_modules'));
      fs.mkdirSync(path.join(options.cwd, 'dist'));
      fs.writeFileSync(path.join(options.cwd, 'dist/generated.txt'), 'generated\n');
      return;
    }
    execFileSync(command, args, options);
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

it('archives the frozen SHA and restores dependencies only inside the capsule', () => {
  const root = fixture();
  const candidate = beginFormalA5Candidate(root);
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'dirty workspace\n');
  fs.writeFileSync(path.join(root, 'untracked.txt'), 'untracked\n');
  fs.writeFileSync(path.join(root, 'ignored.txt'), 'ignored\n');
  const events = [];
  const stages = [];
  const capsule = openMacosA5BuildCapsule(context(root, candidate), {
    onStage: (stage) => stages.push(stage), run: runner(events)
  });

  expect(fs.readFileSync(path.join(capsule.buildRoot, 'tracked.txt'), 'utf8')).toBe('committed\n');
  expect(fs.existsSync(path.join(capsule.buildRoot, 'untracked.txt'))).toBe(false);
  expect(fs.existsSync(path.join(capsule.buildRoot, 'ignored.txt'))).toBe(false);
  expect(fs.existsSync(path.join(capsule.buildRoot, 'node_modules'))).toBe(true);
  expect(fs.existsSync(path.join(capsule.buildRoot, 'dist/generated.txt'))).toBe(true);
  expect(events.map(({ command }) => command)).toEqual(['git', 'tar', 'npm']);
  expect(stages).toEqual(['archive', 'extract', 'dependencies']);
  expect(events.at(-1).cwd).toBe(capsule.buildRoot);
  closeMacosA5BuildCapsule(capsule);
  expect(fs.existsSync(capsule.capsuleRoot)).toBe(false);
});

it('keeps the first SHA after dev advances and cleans dependency failures', () => {
  const root = fixture();
  const candidate = beginFormalA5Candidate(root);
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'next commit\n');
  git(root, ['add', 'tracked.txt']);
  git(root, ['commit', '-m', 'advance dev']);
  const capsule = openMacosA5BuildCapsule(context(root, candidate,
    '77777777-7777-7777-7777-777777777777'), { run: runner([]) });
  expect(fs.readFileSync(path.join(capsule.buildRoot, 'tracked.txt'), 'utf8')).toBe('committed\n');
  closeMacosA5BuildCapsule(capsule);

  const failedContext = context(root, beginFormalA5Candidate(root),
    '88888888-8888-8888-8888-888888888888');
  expect(() => openMacosA5BuildCapsule(failedContext, { run: runner([], true) }))
    .toThrow('npm ci failed');
  expect(JSON.parse(fs.readFileSync(path.join(failedContext.artifactsRoot, 'macos-a5-formal',
    failedContext.runId, 'capsule-failure.json'), 'utf8'))).toMatchObject({
    acceptedRevision: failedContext.acceptedRevision, resultStatus: 'failed',
    stage: 'dependencies'
  });
  const capsulesRoot = path.join(failedContext.controllerStateRoot, 'capsules');
  expect(fs.readdirSync(capsulesRoot)).toEqual([]);
});

it('refuses cleanup after its ownership marker is changed', () => {
  const root = fixture();
  const capsule = openMacosA5BuildCapsule(context(root, beginFormalA5Candidate(root),
    '99999999-9999-9999-9999-999999999999'), { run: runner([]) });
  fs.writeFileSync(path.join(capsule.capsuleRoot, 'owner.json'), '{}\n');
  expect(() => closeMacosA5BuildCapsule(capsule)).toThrow('another run');
  expect(fs.existsSync(capsule.buildRoot)).toBe(true);
});
