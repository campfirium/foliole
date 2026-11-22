/* global process */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

import { checked } from './macos-a5-process.mjs';
import { macosA5CapsulesRoot } from './macos-a5-build-capsule.mjs';
import { withMacosA5BuildRoot } from './macos-a5-execution-context.mjs';

// A sealed template is a frozen capsule right after its Android build. Runs never use it
// in place: each run clones it (APFS copy-on-write) into its own private capsule.
const TEMPLATE_FILE = 'template.json';
const OWNER_FILE = 'owner.json';
const SCHEMA_VERSION = 1;
export const MACOS_A5_BUILD_TEMPLATE_KEEP = 3;
// Sealing is skipped below about two templates (~2.5 GB each) of free space on the volume.
export const MACOS_A5_BUILD_TEMPLATE_MIN_FREE_BYTES = 5 * 1024 ** 3;
export const MACOS_A5_BUILD_TEMPLATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_TEMPORARY_MS = 24 * 60 * 60 * 1000;
const BUILD_ENV_PREFIXES = ['FOLIOLE_', 'VITE_', 'ANDROID_', 'JAVA_', 'GRADLE_', 'NODE_', 'npm_config_'];
// Runtime-only controls that never reach the built artifacts.
const RUNTIME_ONLY_ENV = new Set([
  'FOLIOLE_A5_LEASE_WAIT_SECONDS', 'FOLIOLE_SHARED_CACHE_ROOT', 'FOLIOLE_ALLOW_PARALLEL_INSTANCE'
]);
// These actions produce a different artifact than the standard debug pair.
const UNCACHED_ACTIONS = new Set(['bundle-release', 'database-performance']);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fileDigest(filePath, fsApi) {
  return sha256(fsApi.readFileSync(filePath));
}

export function macosA5BuildTemplateEligible(context) {
  return context.formalSourceClass === 'frozen-build' && Boolean(context.acceptedRevision)
    && !UNCACHED_ACTIONS.has(context.action) && Boolean(context.buildStorage?.templatesRoot);
}

export function macosA5BuildEnvDigest(env) {
  const entries = Object.keys(env).filter((key) => !RUNTIME_ONLY_ENV.has(key)
    && BUILD_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))).sort()
    .map((key) => [key, String(env[key])]);
  return { digest: sha256(JSON.stringify(entries)), keys: entries.map(([key]) => key) };
}

function listNames(directory, fsApi) {
  try { return fsApi.readdirSync(directory).filter((name) => !name.startsWith('.')).sort(); }
  catch { return []; }
}

export function macosA5BuildToolchain(env, { fsApi = fs, run = spawnSync } = {}) {
  const output = (command, args) => {
    const result = run(command, args, { encoding: 'utf8', env });
    if (result.status !== 0) throw new Error(`Unable to identify build tool ${command}.`);
    return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  };
  const sdk = env.ANDROID_SDK_ROOT;
  return {
    androidBuildTools: listNames(path.join(sdk, 'build-tools'), fsApi),
    androidPlatforms: listNames(path.join(sdk, 'platforms'), fsApi),
    java: output(path.join(env.JAVA_HOME, 'bin/java'), ['-version']),
    node: process.version,
    npm: output('npm', ['--version'])
  };
}

export function macosA5BuildTemplateKey(context, {
  buildEnv, execute = execFileSync, fsApi = fs, recipeFiles, toolchain
}) {
  const lockfile = execute('git', ['show', `${context.acceptedRevision}:package-lock.json`], {
    cwd: context.sourceRepoRoot
  });
  const recipe = recipeFiles.slice().sort().map((filePath) => [
    path.relative(context.sourceRepoRoot, filePath), fileDigest(filePath, fsApi)
  ]);
  const env = macosA5BuildEnvDigest(buildEnv);
  const fields = {
    acceptedRevision: context.acceptedRevision,
    acceptedTree: context.acceptedTree,
    buildEnvDigest: env.digest,
    buildEnvKeys: env.keys,
    hiddenDesktopRuntime: Boolean(context.requiresHiddenDesktopRuntime),
    lockfileDigest: sha256(lockfile),
    recipeDigest: sha256(JSON.stringify(recipe)),
    schemaVersion: SCHEMA_VERSION,
    toolchainDigest: sha256(JSON.stringify(toolchain))
  };
  const keyed = { ...fields };
  delete keyed.buildEnvKeys;
  return { digest: sha256(JSON.stringify(keyed)), fields };
}

export function macosA5BuildTemplatesRoot(context) {
  const root = context.buildStorage?.templatesRoot;
  if (!root) throw new Error('Build templates need the shared build volume.');
  return root;
}

function freeBytes(directory, fsApi) {
  const stats = fsApi.statfsSync(directory);
  return Number(stats.bavail) * Number(stats.bsize);
}

function readSeal(templateRoot, fsApi) {
  try { return JSON.parse(fsApi.readFileSync(path.join(templateRoot, TEMPLATE_FILE), 'utf8')); }
  catch { return null; }
}

function archiveDigest(context, capsuleRoot, fsApi, run) {
  const archivePath = path.join(capsuleRoot, 'source.tar');
  run('git', ['archive', '--format=tar', `--output=${archivePath}`, context.acceptedRevision],
    { cwd: context.sourceRepoRoot });
  try { return fileDigest(archivePath, fsApi); }
  finally { fsApi.rmSync(archivePath, { force: true }); }
}

function artifactPaths(buildRoot) {
  return {
    apk: path.join(buildRoot, 'android/app/build/outputs/apk/debug/app-debug.apk'),
    androidTestApk: path.join(buildRoot,
      'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk')
  };
}

function removeTemplate(templateRoot, fsApi) {
  try { fsApi.rmSync(templateRoot, { force: true, recursive: true }); } catch { /* best effort */ }
}

// Returns a run capsule cloned from a matching sealed template, or null on any miss.
export function openReusedMacosA5BuildCapsule(context, key, {
  fsApi = fs, log = (line) => process.stderr.write(`${line}\n`), now = Date.now,
  onStage = () => {}, run = checked
} = {}) {
  const templateRoot = path.join(macosA5BuildTemplatesRoot(context), key.digest);
  const seal = readSeal(templateRoot, fsApi);
  if (!seal) return null;
  if (seal.key?.digest !== key.digest || seal.schemaVersion !== SCHEMA_VERSION) {
    log(`[macos-a5-build-template] discarding inconsistent template ${key.digest}`);
    removeTemplate(templateRoot, fsApi);
    return null;
  }
  const capsulesRoot = macosA5CapsulesRoot(context);
  fsApi.mkdirSync(capsulesRoot, { recursive: true });
  const capsuleRoot = fsApi.mkdtempSync(path.join(capsulesRoot, `${context.runId}-`));
  fsApi.writeFileSync(path.join(capsuleRoot, OWNER_FILE), `${JSON.stringify({
    acceptedRevision: context.acceptedRevision, action: context.action,
    pid: process.pid, runId: context.runId, schemaVersion: 1
  }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  const buildRoot = path.join(capsuleRoot, 'source');
  try {
    onStage('template-clone');
    run('cp', ['-c', '-R', path.join(templateRoot, 'source'), buildRoot]);
    onStage('template-verify');
    const sourceArchiveDigest = archiveDigest(context, capsuleRoot, fsApi, run);
    const artifacts = artifactPaths(buildRoot);
    if (sourceArchiveDigest !== seal.sourceArchiveDigest
        || fileDigest(artifacts.apk, fsApi) !== seal.apkDigest
        || fileDigest(artifacts.androidTestApk, fsApi) !== seal.androidTestApkDigest) {
      throw Object.assign(new Error('Sealed build template does not match its recorded digests.'),
        { templateMismatch: true });
    }
    const touched = new Date(now());
    fsApi.utimesSync(path.join(templateRoot, TEMPLATE_FILE), touched, touched);
    log(`[macos-a5-build-template] reuse ${key.digest} built-by=${seal.builtByRunId}`);
    return { capsule: withMacosA5BuildRoot(context, buildRoot, capsuleRoot, sourceArchiveDigest),
      seal };
  } catch (error) {
    log(`[macos-a5-build-template] reuse failed, rebuilding: ${error.message}`);
    if (error.templateMismatch) removeTemplate(templateRoot, fsApi);
    fsApi.rmSync(capsuleRoot, { force: true, recursive: true });
    return null;
  }
}

export function pruneMacosA5BuildTemplates(templatesRoot, {
  fsApi = fs, keep = MACOS_A5_BUILD_TEMPLATE_KEEP,
  maxAgeMs = MACOS_A5_BUILD_TEMPLATE_MAX_AGE_MS, now = Date.now
} = {}) {
  let names;
  try { names = fsApi.readdirSync(templatesRoot); } catch { return []; }
  const removed = [];
  const sealed = [];
  for (const name of names) {
    const root = path.join(templatesRoot, name);
    if (name.startsWith('.tmp-')) {
      const age = now() - fsApi.statSync(root).mtimeMs;
      if (age > STALE_TEMPORARY_MS) { removeTemplate(root, fsApi); removed.push(name); }
      continue;
    }
    let usedAt;
    try { usedAt = fsApi.statSync(path.join(root, TEMPLATE_FILE)).mtimeMs; }
    catch { removeTemplate(root, fsApi); removed.push(name); continue; }
    sealed.push({ name, root, usedAt });
  }
  sealed.sort((left, right) => right.usedAt - left.usedAt);
  sealed.forEach((entry, index) => {
    if (index < keep && now() - entry.usedAt <= maxAgeMs) return;
    removeTemplate(entry.root, fsApi);
    removed.push(entry.name);
  });
  return removed;
}

// Seals the capsule right after a successful Android build. Failure never fails the run.
export function sealMacosA5BuildTemplate(capsule, key, {
  fsApi = fs, log = (line) => process.stderr.write(`${line}\n`),
  minFreeBytes = MACOS_A5_BUILD_TEMPLATE_MIN_FREE_BYTES,
  now = () => new Date().toISOString(), run = checked
} = {}) {
  let templatesRoot;
  try { templatesRoot = macosA5BuildTemplatesRoot(capsule); }
  catch (error) { log(`[macos-a5-build-template] seal skipped: ${error.message}`); return false; }
  const target = path.join(templatesRoot, key.digest);
  const temporary = path.join(templatesRoot, `.tmp-${capsule.runId}`);
  try {
    if (readSeal(target, fsApi)) return false;
    fsApi.mkdirSync(templatesRoot, { recursive: true });
    const available = freeBytes(templatesRoot, fsApi);
    if (available < minFreeBytes) {
      log(`[macos-a5-build-template] seal skipped: only ${(available / 1024 ** 3).toFixed(1)} GiB free`);
      return false;
    }
    const artifacts = artifactPaths(capsule.buildRoot);
    const seal = {
      androidTestApkDigest: fileDigest(artifacts.androidTestApk, fsApi),
      apkDigest: fileDigest(artifacts.apk, fsApi),
      builtByRunId: capsule.runId,
      key,
      schemaVersion: SCHEMA_VERSION,
      sealedAt: now(),
      sourceArchiveDigest: capsule.sourceArchiveDigest
    };
    if (!/^[0-9a-f]{64}$/u.test(seal.sourceArchiveDigest ?? '')) {
      throw new Error('capsule source archive digest is missing');
    }
    fsApi.mkdirSync(templatesRoot, { recursive: true });
    fsApi.rmSync(temporary, { force: true, recursive: true });
    fsApi.mkdirSync(temporary);
    run('cp', ['-c', '-R', capsule.buildRoot, path.join(temporary, 'source')]);
    fsApi.writeFileSync(path.join(temporary, TEMPLATE_FILE),
      `${JSON.stringify(seal, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    try { fsApi.renameSync(temporary, target); }
    catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(error?.code)) throw error;
      fsApi.rmSync(temporary, { force: true, recursive: true });
      return false;
    }
    log(`[macos-a5-build-template] sealed ${key.digest}`);
    pruneMacosA5BuildTemplates(templatesRoot, { fsApi });
    return true;
  } catch (error) {
    log(`[macos-a5-build-template] seal skipped: ${error.message}`);
    try { fsApi.rmSync(temporary, { force: true, recursive: true }); } catch { /* best effort */ }
    return false;
  }
}
