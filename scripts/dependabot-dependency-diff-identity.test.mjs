// @vitest-environment node

import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { identifyDependabotDependencyDiff } from './dependabot-dependency-diff-identity.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/electron-update-contract.json', import.meta.url), 'utf8'));

function dependencyPullRequest(kind = 'electron', overrides = {}) {
  const dependency = fixture.dependencies[kind];
  return {
    files: [
      { path: 'package.json', before: dependency.beforeManifest, after: dependency.afterManifest },
      { path: 'package-lock.json', before: dependency.beforeLock, after: dependency.afterLock }
    ],
    pr: { authorLogin: 'app/dependabot', baseRefName: 'dev', headSha: 'electron-head', number: 69 },
    retrieval: { complete: true },
    ...overrides
  };
}

describe('Dependabot dependency diff identity contract', () => {
  it.each([
    ['electron', 'electron'],
    ['other', 'other']
  ])('identifies a complete %s dependency diff', (fixtureKind, dependencyKind) => {
    expect(identifyDependabotDependencyDiff(dependencyPullRequest(fixtureKind))).toMatchObject({
      dependencyKind,
      headSha: 'electron-head',
      prNumber: 69,
      reason: 'dependency-diff-identified',
      status: 'identified'
    });
  });

  it('does not guess when changed files exceed dependency intent', () => {
    const input = dependencyPullRequest();
    input.files.push({ path: 'src/app/App.tsx', before: '', after: 'changed' });
    expect(identifyDependabotDependencyDiff(input)).toMatchObject({
      dependencyKind: 'unknown',
      reason: 'changed-files-outside-dependency-intent',
      status: 'unknown'
    });
  });

  it('identifies a verified lockfile-only transitive dependency update', () => {
    const beforeLock = {
      lockfileVersion: 3,
      name: 'foliole',
      packages: {
        '': { devDependencies: { eslint: '9.39.5' }, name: 'foliole' },
        'node_modules/eslint': { version: '9.39.5' },
        'node_modules/eslint/node_modules/@humanfs/node': { version: '0.16.7' }
      }
    };
    const afterLock = JSON.parse(JSON.stringify(beforeLock));
    afterLock.packages['node_modules/eslint/node_modules/@humanfs/node'].version = '0.16.8';
    const input = dependencyPullRequest('other', {
      files: [{ path: 'package-lock.json', before: beforeLock, after: afterLock }]
    });

    expect(identifyDependabotDependencyDiff(input)).toMatchObject({
      dependencyKind: 'other',
      dependencyNames: ['@humanfs/node'],
      reason: 'lockfile-transitive-diff-identified',
      status: 'identified'
    });
  });

  it('rejects a lockfile-only update that changes root dependency intent', () => {
    const beforeLock = { lockfileVersion: 3, packages: { '': { dependencies: { react: '1.0.0' } } } };
    const afterLock = { lockfileVersion: 3, packages: { '': { dependencies: { react: '2.0.0' } } } };
    const input = dependencyPullRequest('other', {
      files: [{ path: 'package-lock.json', before: beforeLock, after: afterLock }]
    });

    expect(identifyDependabotDependencyDiff(input)).toMatchObject({
      reason: 'lockfile-root-or-metadata-changed',
      status: 'unknown'
    });
  });

  it('does not guess when author, base, manifest, and lock intent are not all verified', () => {
    expect(identifyDependabotDependencyDiff(dependencyPullRequest('electron', {
      pr: { authorLogin: 'dependabot', baseRefName: 'dev', headSha: 'untrusted-head', number: 69 }
    })).status).toBe('unknown');

    const mismatched = dependencyPullRequest();
    mismatched.files[1].after = fixture.dependencies.other.afterLock;
    expect(identifyDependabotDependencyDiff(mismatched)).toMatchObject({
      reason: 'manifest-lock-intent-mismatch',
      status: 'unknown'
    });

    const staleLock = dependencyPullRequest();
    staleLock.files[1].after.packages['node_modules/electron'].version = '43.4.1';
    expect(identifyDependabotDependencyDiff(staleLock)).toMatchObject({
      reason: 'lockfile-direct-dependency-mismatch',
      status: 'unknown'
    });
  });

  it.each([
    ['failed read', { retrieval: { complete: false, error: 'HTTP 502' } }],
    ['incomplete read', { retrieval: { complete: false } }],
    ['unparseable content', {
      files: [
        { path: 'package.json', before: '{', after: '}' },
        { path: 'package-lock.json', before: '{}', after: '{}' }
      ]
    }]
  ])('classifies %s as a source error', (_label, overrides) => {
    expect(identifyDependabotDependencyDiff(dependencyPullRequest('electron', overrides)).status).toBe('source-error');
  });
});
