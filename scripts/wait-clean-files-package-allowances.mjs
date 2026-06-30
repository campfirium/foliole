/* global process, structuredClone */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function readHeadFile(file, { cwd = process.cwd() } = {}) {
  return execFileSync('git', ['show', `HEAD:${file}`], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function readJsonFromHeadAndWorktree(file, { cwd = process.cwd() } = {}) {
  return {
    head: JSON.parse(readHeadFile(file, { cwd })),
    worktree: JSON.parse(readFileSync(path.join(cwd, file), 'utf8'))
  };
}

function withoutKeys(value, keys) {
  const clone = structuredClone(value);
  for (const key of keys) {
    delete clone[key];
  }
  return clone;
}

function jsonMatches(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const PACKAGE_DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'overrides'
];

export function packageJsonScriptsMatch({ cwd = process.cwd(), file = 'package.json' } = {}) {
  try {
    const { head, worktree } = readJsonFromHeadAndWorktree(file, { cwd });
    return jsonMatches(head.scripts ?? {}, worktree.scripts ?? {});
  } catch {
    return false;
  }
}

function packageJsonDependencyFieldsOnlyChanged({ cwd = process.cwd(), file = 'package.json' } = {}) {
  try {
    const { head, worktree } = readJsonFromHeadAndWorktree(file, { cwd });
    return jsonMatches(
      withoutKeys(head, PACKAGE_DEPENDENCY_FIELDS),
      withoutKeys(worktree, PACKAGE_DEPENDENCY_FIELDS)
    );
  } catch {
    return false;
  }
}

function normalizePackageLockForDependencyEdit(packageLock) {
  const clone = structuredClone(packageLock);
  if (clone.packages && typeof clone.packages === 'object') {
    if (clone.packages['']) {
      clone.packages[''] = withoutKeys(clone.packages[''], PACKAGE_DEPENDENCY_FIELDS);
    }
    for (const packagePath of Object.keys(clone.packages)) {
      if (packagePath.startsWith('node_modules/')) {
        delete clone.packages[packagePath];
      }
    }
  }
  delete clone.dependencies;
  return clone;
}

function packageLockDependencyFieldsOnlyChanged({ cwd = process.cwd(), file = 'package-lock.json' } = {}) {
  try {
    const { head, worktree } = readJsonFromHeadAndWorktree(file, { cwd });
    return jsonMatches(
      normalizePackageLockForDependencyEdit(head),
      normalizePackageLockForDependencyEdit(worktree)
    );
  } catch {
    return false;
  }
}

export function canIgnorePackageDependencyFile(file, { cwd = process.cwd() } = {}) {
  if (file === 'package.json') {
    return packageJsonDependencyFieldsOnlyChanged({ cwd, file });
  }
  if (file === 'package-lock.json') {
    return packageLockDependencyFieldsOnlyChanged({ cwd, file });
  }
  return false;
}
