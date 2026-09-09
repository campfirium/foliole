import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const T173_WINDOWS_SOURCE_REF = 'refs/heads/sync';
export const T173_WINDOWS_REPO_ROOT = 'D:\\C\\foliole-sync';
export const T173_WINDOWS_REPO_ROOT_POSIX = 'D:/C/foliole-sync';
export const T173_WINDOWS_ACTIONS = new Set(['multi-device-sync-c']);

export function t173PreparedBuildPaths(repoRoot) {
  return {
    electron: path.join(repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe'),
    main: path.join(repoRoot, 'dist', 'electron', 'main.js')
  };
}

const SHA = /^[0-9a-f]{40}$/u;
const ROUTE = /^t173-sync-[0-9a-f]{10}-[0-9a-f-]{36}$/u;

function normalizedRoot(value) {
  return String(value).replaceAll('\\', '/').replace(/\/$/u, '').toLowerCase();
}

export function assertT173CandidateBoundary(value) {
  if (value?.branch !== 'sync' || value?.clean !== true || value?.committed !== true
      || value?.sourceRef !== T173_WINDOWS_SOURCE_REF || !SHA.test(value.revision ?? '')
      || !SHA.test(value.treeDigest ?? '')
      || normalizedRoot(value.sourceRoot) !== T173_WINDOWS_REPO_ROOT_POSIX.toLowerCase()) {
    throw new Error('T173 Windows candidate boundary is invalid.');
  }
  return value;
}

export function assertT173RouteIdentity(value, revision) {
  if (!ROUTE.test(value ?? '') || !value.startsWith(`t173-sync-${revision.slice(0, 10)}-`)) {
    throw new Error('T173 Windows route identity is invalid.');
  }
  return value;
}

export function assertT173RuntimeIdentity(expected, actual) {
  assertT173CandidateBoundary(expected);
  assertT173CandidateBoundary(actual);
  for (const key of ['revision', 'treeDigest', 'sourceRef']) {
    if (actual[key] !== expected[key]) throw new Error(`T173 Windows runtime ${key} mismatch.`);
  }
  if (normalizedRoot(actual.sourceRoot) !== normalizedRoot(expected.sourceRoot)) {
    throw new Error('T173 Windows runtime sourceRoot mismatch.');
  }
  return actual;
}

function git(exec, gitPath, repoRoot, args) {
  const safeRoot = repoRoot.replaceAll('\\', '/');
  return exec(gitPath, ['-c', `safe.directory=${safeRoot}`, ...args], {
    cwd: repoRoot, encoding: 'utf8'
  }).trim();
}

export function measureT173RuntimeIdentity({
  exec = execFileSync, gitPath, repoRoot = T173_WINDOWS_REPO_ROOT
}) {
  const sourceRoot = path.win32.resolve(repoRoot);
  const revision = git(exec, gitPath, sourceRoot, ['rev-parse', 'HEAD']);
  const treeDigest = git(exec, gitPath, sourceRoot, ['rev-parse', 'HEAD^{tree}']);
  const branch = git(exec, gitPath, sourceRoot, ['branch', '--show-current']);
  const dirty = git(exec, gitPath, sourceRoot, ['status', '--short']);
  return assertT173CandidateBoundary({ branch, clean: dirty === '', committed: true,
    revision, sourceRef: T173_WINDOWS_SOURCE_REF, sourceRoot, treeDigest });
}
