// @vitest-environment node
/* global process */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import {
  macosA5BuildEnvDigest, macosA5BuildTemplateEligible, macosA5BuildTemplateKey,
  macosA5BuildTemplatesRoot, openReusedMacosA5BuildCapsule, pruneMacosA5BuildTemplates,
  sealMacosA5BuildTemplate
} from './macos-a5-build-template.mjs';
import { createMacosA5ExecutionContext, withMacosA5BuildRoot } from './macos-a5-execution-context.mjs';

const roots = [];
const RUN_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RUN_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const APK = 'android/app/build/outputs/apk/debug/app-debug.apk';
const TEST_APK = 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk';
const quiet = () => {};

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

// Portable stand-in for the controller runner: real git, plain recursive copy for `cp -c -R`.
function run(command, args, options = {}) {
  if (command === 'cp') {
    fs.cpSync(args.at(-2), args.at(-1), { recursive: true, verbatimSymlinks: true });
    return;
  }
  execFileSync(command, args, { cwd: options.cwd });
}

function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'macos-a5-template-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
  fs.writeFileSync(path.join(root, 'recipe.mjs'), 'export const recipe = 1;\n');
  git(root, ['init', '-b', 'dev']);
  git(root, ['config', 'user.email', 'template@example.invalid']);
  git(root, ['config', 'user.name', 'Template Test']);
  git(root, ['add', '.']); git(root, ['commit', '-m', 'fixture']);
  return root;
}

function contextFor(root, runId, overrides = {}) {
  return createMacosA5ExecutionContext({
    acceptedRevision: git(root, ['rev-parse', 'HEAD']),
    acceptedTree: git(root, ['rev-parse', 'HEAD^{tree}']),
    action: 'deploy', formalSourceClass: 'frozen-build', repoRoot: root, runId, ...overrides
  });
}

function keyFor(context, { env = { FOLIOLE_ANDROID_COMPANION_SYNC_PORT: '38644' },
  toolchain = { java: '21', node: 'v26' } } = {}) {
  return macosA5BuildTemplateKey(context, { buildEnv: env,
    recipeFiles: [path.join(context.sourceRepoRoot, 'recipe.mjs')], toolchain });
}

function archiveDigestOf(context) {
  const archive = path.join(os.tmpdir(), `macos-a5-template-${process.pid}.tar`);
  execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, context.acceptedRevision],
    { cwd: context.sourceRepoRoot });
  try {
    return execFileSync('shasum', ['-a', '256', archive], { encoding: 'utf8' }).split(' ')[0];
  } finally { fs.rmSync(archive, { force: true }); }
}

// A capsule as it stands right after a successful Android build.
function builtCapsule(context) {
  const capsuleRoot = path.join(context.controllerStateRoot, 'capsules', `${context.runId}-built`);
  const buildRoot = path.join(capsuleRoot, 'source');
  for (const [relative, body] of [[APK, 'apk-bytes'], [TEST_APK, 'test-apk-bytes'],
    ['node_modules/.bin/cap', 'cap']]) {
    fs.mkdirSync(path.dirname(path.join(buildRoot, relative)), { recursive: true });
    fs.writeFileSync(path.join(buildRoot, relative), body);
  }
  return withMacosA5BuildRoot(context, buildRoot, capsuleRoot, archiveDigestOf(context));
}

function sealFor(root, key) {
  const capsule = builtCapsule(contextFor(root, RUN_A));
  expect(sealMacosA5BuildTemplate(capsule, key, { log: quiet, run })).toBe(true);
  return capsule;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

it('keys a template by every input that can change the built artifacts', () => {
  const root = repository();
  const context = contextFor(root, RUN_A);
  const base = keyFor(context).digest;
  expect(keyFor(contextFor(root, RUN_B)).digest).toBe(base);
  expect(keyFor(context, { env: { FOLIOLE_ANDROID_COMPANION_SYNC_PORT: '38644',
    FOLIOLE_A5_LEASE_WAIT_SECONDS: '1200', HOME: '/elsewhere' } }).digest).toBe(base);
  expect(keyFor(context, { env: { FOLIOLE_ANDROID_COMPANION_SYNC_PORT: '38645' } }).digest)
    .not.toBe(base);
  expect(keyFor(context, { env: { FOLIOLE_ANDROID_COMPANION_SYNC_PORT: '38644',
    VITE_FLAG: '1' } }).digest).not.toBe(base);
  expect(keyFor(context, { toolchain: { java: '22', node: 'v26' } }).digest).not.toBe(base);
  expect(keyFor(contextFor(root, RUN_A, { requiresHiddenDesktopRuntime: true })).digest)
    .not.toBe(base);
  fs.writeFileSync(path.join(root, 'recipe.mjs'), 'export const recipe = 2;\n');
  expect(keyFor(context).digest).not.toBe(base);
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3,"x":1}\n');
  git(root, ['commit', '-am', 'next']);
  const next = contextFor(root, RUN_A);
  expect(next.acceptedRevision).not.toBe(context.acceptedRevision);
  expect(keyFor(next).fields.lockfileDigest).not.toBe(keyFor(context).fields.lockfileDigest);
  expect(keyFor(next).digest).not.toBe(keyFor(context).digest);
});

it('ignores runtime-only controls in the build environment digest', () => {
  expect(macosA5BuildEnvDigest({ FOLIOLE_SHARED_CACHE_ROOT: '/a', PATH: '/bin' }).keys).toEqual([]);
  expect(macosA5BuildEnvDigest({ npm_config_cache: '/c', JAVA_HOME: '/j' }).keys)
    .toEqual(['JAVA_HOME', 'npm_config_cache']);
});

it('only caches the standard frozen debug build', () => {
  const root = repository();
  expect(macosA5BuildTemplateEligible(contextFor(root, RUN_A))).toBe(true);
  for (const action of ['bundle-release', 'database-performance']) {
    expect(macosA5BuildTemplateEligible(contextFor(root, RUN_A, { action }))).toBe(false);
  }
  expect(macosA5BuildTemplateEligible(contextFor(root, RUN_A, {
    acceptedRevision: null, formalSourceClass: null }))).toBe(false);
});

it('clones a sealed template into a private capsule owned by the next run', () => {
  const root = repository();
  const key = keyFor(contextFor(root, RUN_A));
  const built = sealFor(root, key);
  const next = contextFor(root, RUN_B);
  const reused = openReusedMacosA5BuildCapsule(next, key, { log: quiet, run });
  expect(reused.seal.builtByRunId).toBe(RUN_A);
  expect(reused.capsule.sourceArchiveDigest).toBe(built.sourceArchiveDigest);
  expect(path.basename(reused.capsule.capsuleRoot).startsWith(`${RUN_B}-`)).toBe(true);
  expect(fs.readFileSync(path.join(reused.capsule.buildRoot, APK), 'utf8')).toBe('apk-bytes');
  expect(JSON.parse(fs.readFileSync(path.join(reused.capsule.capsuleRoot, 'owner.json'), 'utf8')))
    .toMatchObject({ pid: process.pid, runId: RUN_B });
  fs.writeFileSync(path.join(reused.capsule.buildRoot, APK), 'changed by the run');
  const template = path.join(macosA5BuildTemplatesRoot(next), key.digest, 'source', APK);
  expect(fs.readFileSync(template, 'utf8')).toBe('apk-bytes');
});

it('treats a template directory without its seal as a miss', () => {
  const root = repository();
  const context = contextFor(root, RUN_B);
  const key = keyFor(context);
  fs.mkdirSync(path.join(macosA5BuildTemplatesRoot(context), key.digest, 'source'), { recursive: true });
  expect(openReusedMacosA5BuildCapsule(context, key, { log: quiet, run })).toBeNull();
});

it('discards a template whose artifacts no longer match the seal and removes the partial capsule', () => {
  const root = repository();
  const key = keyFor(contextFor(root, RUN_A));
  sealFor(root, key);
  const next = contextFor(root, RUN_B);
  const templateRoot = path.join(macosA5BuildTemplatesRoot(next), key.digest);
  fs.writeFileSync(path.join(templateRoot, 'source', APK), 'tampered');
  expect(openReusedMacosA5BuildCapsule(next, key, { log: quiet, run })).toBeNull();
  expect(fs.existsSync(templateRoot)).toBe(false);
  const capsules = fs.readdirSync(path.join(next.controllerStateRoot, 'capsules'));
  expect(capsules.filter((name) => name.startsWith(RUN_B))).toEqual([]);
});

it('rejects a template whose recorded source archive differs from the candidate', () => {
  const root = repository();
  const key = keyFor(contextFor(root, RUN_A));
  sealFor(root, key);
  const next = contextFor(root, RUN_B);
  const sealPath = path.join(macosA5BuildTemplatesRoot(next), key.digest, 'template.json');
  const seal = JSON.parse(fs.readFileSync(sealPath, 'utf8'));
  fs.writeFileSync(sealPath, JSON.stringify({ ...seal, sourceArchiveDigest: '0'.repeat(64) }));
  expect(openReusedMacosA5BuildCapsule(next, key, { log: quiet, run })).toBeNull();
});

it('keeps the first sealed template when a concurrent run seals the same key', () => {
  const root = repository();
  const key = keyFor(contextFor(root, RUN_A));
  sealFor(root, key);
  const second = builtCapsule(contextFor(root, RUN_B));
  expect(sealMacosA5BuildTemplate(second, key, { log: quiet, run })).toBe(false);
  const names = fs.readdirSync(macosA5BuildTemplatesRoot(second));
  expect(names).toEqual([key.digest]);
});

it('evicts the least recently used templates beyond the limit, old ones and leftovers', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'macos-a5-template-prune-'));
  roots.push(root);
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const make = (name, ageMs, sealed = true) => {
    fs.mkdirSync(path.join(root, name, 'source'), { recursive: true });
    if (sealed) {
      const file = path.join(root, name, 'template.json');
      fs.writeFileSync(file, '{}');
      const at = new Date(now - ageMs);
      fs.utimesSync(file, at, at);
    }
    const at = new Date(now - ageMs);
    fs.utimesSync(path.join(root, name), at, at);
  };
  for (let index = 0; index < 7; index += 1) make(`t${index}`, index * 60_000);
  make('old', 8 * day);
  make('unsealed', 0, false);
  make('.tmp-crashed', 2 * day, false);
  make('.tmp-active', 60_000, false);
  const removed = pruneMacosA5BuildTemplates(root, { now: () => now });
  expect(removed.sort()).toEqual(['.tmp-crashed', 'old', 't6', 'unsealed']);
  expect(fs.readdirSync(root).sort())
    .toEqual(['.tmp-active', 't0', 't1', 't2', 't3', 't4', 't5']);
});
