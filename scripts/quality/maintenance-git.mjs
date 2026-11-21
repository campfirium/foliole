// Read-only git helpers shared by the quality-maintenance scripts.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RELEASE_TAG_PATTERN = /^v\d+\.\d+\.\d+$/u;

export const DEFAULT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trimEnd();
}

export function tryGit(cwd, args) {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
}

export function resolveCommit(cwd, ref) {
  return tryGit(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
}

export function commitDate(cwd, ref) {
  return git(cwd, ['log', '-1', '--format=%cs', ref]);
}

export function isAncestor(cwd, ancestor, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function changedFiles(cwd, from, to) {
  const output = git(cwd, ['diff', '--name-only', from, to]);
  return output ? output.split('\n') : [];
}

/** Release tags reachable from `to` but not from `from`, oldest first. */
export function releaseTagsBetween(cwd, from, to) {
  const args = ['tag', '--merged', to, '--sort=creatordate'];
  if (from) args.push('--no-merged', from);
  const output = git(cwd, args);
  return output ? output.split('\n').filter((tag) => RELEASE_TAG_PATTERN.test(tag)) : [];
}

export function latestReleaseTag(cwd, to) {
  return releaseTagsBetween(cwd, null, to).at(-1) ?? null;
}

export function daysBetween(fromDate, toDate) {
  return Math.floor((Date.parse(toDate) - Date.parse(fromDate)) / 86_400_000);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
