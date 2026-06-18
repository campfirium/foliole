import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ACTIVE_ROOT_SEMANTICS = new Map([
  ['android', 'host project'],
  ['artifacts', 'release artifact root'],
  ['assets', 'source assets and documentation/runtime-imported brand assets'],
  ['build', 'host packaging and resource inputs, not build output'],
  ['docs', 'documentation'],
  ['electron', 'host runtime'],
  ['ios', 'host project'],
  ['lib', 'shared runtime library'],
  ['public', 'shared Vite public static copied into target outputs'],
  ['releases', 'release metadata'],
  ['scripts', 'repository automation'],
  ['src', 'application source'],
  ['tests', 'test support']
]);
const ACTIVE_ROOTS = new Set(ACTIVE_ROOT_SEMANTICS.keys());
const BASELINE_ALLOWED_ROOTS = new Set(['.agents', '.claude', '.codex', '.git', '.github', '.githooks', '.lab']);
const EXEMPT_ROOTS = new Set([
  'dist',
  'logs',
  'node_modules',
  'ref',
  'release',
  'src-tauri',
  'trees'
]);
const EXEMPT_PATTERNS = [/^\.tmp(?:$|[-_])/, /^_tmp(?:$|[-_])/, /^tmp(?:$|[-_])/];

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function listRootDirectories(repoRoot) {
  return fs
    .readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function isExemptRoot(name) {
  return EXEMPT_ROOTS.has(name) || EXEMPT_PATTERNS.some((pattern) => pattern.test(name));
}

function isAuthorizedRoot(name) {
  return ACTIVE_ROOTS.has(name) || BASELINE_ALLOWED_ROOTS.has(name) || isExemptRoot(name);
}

export function inspectRepositoryRootBoundary({ repoRoot = resolveRepoRoot() } = {}) {
  const rootDirectories = listRootDirectories(repoRoot);
  const unauthorizedRoots = rootDirectories.filter((name) => !isAuthorizedRoot(name));

  return {
    activeRoots: [...ACTIVE_ROOTS],
    activeRootSemantics: Object.fromEntries(ACTIVE_ROOT_SEMANTICS),
    baselineAllowedRoots: [...BASELINE_ALLOWED_ROOTS],
    checkedRootCount: rootDirectories.length,
    exemptRoots: rootDirectories.filter((name) => isExemptRoot(name)),
    ok: unauthorizedRoots.length === 0,
    repoRoot,
    rootDirectories,
    unauthorizedRoots
  };
}

function printResult(result, { stderr = process.stderr, stdout = process.stdout } = {}) {
  if (result.ok) {
    stdout.write(
      `[check-repository-root-boundary] status: OK checked_roots=${result.checkedRootCount} unauthorized_roots=0\n`
    );
    return;
  }

  stderr.write(
    `[check-repository-root-boundary] status: VIOLATION checked_roots=${result.checkedRootCount} unauthorized_roots=${result.unauthorizedRoots.length}\n`
  );
  stderr.write(
    `[check-repository-root-boundary] unauthorized=${result.unauthorizedRoots.join(',')} allowed=${[...result.activeRoots, ...result.baselineAllowedRoots].join(',')}\n`
  );
}

export function runCli({
  repoRoot = process.env.FOLIOLE_REPOSITORY_ROOT_BOUNDARY_ROOT?.trim() || resolveRepoRoot(),
  stderr = process.stderr,
  stdout = process.stdout
} = {}) {
  const result = inspectRepositoryRootBoundary({ repoRoot });

  printResult(result, { stderr, stdout });
  return {
    exitCode: result.ok ? 0 : 1,
    result
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli().exitCode;
}
