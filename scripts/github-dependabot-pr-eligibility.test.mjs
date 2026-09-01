// @vitest-environment node

import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import { resolveDependabotPrEligibility } from './github-dependabot-pr-eligibility.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/electron-update-contract.json', import.meta.url), 'utf8'));
const pr = {
  author: { login: 'app/dependabot' },
  baseRefName: 'dev',
  headRefOid: 'electron-head',
  number: 42
};

function encoded(value) {
  return { content: Buffer.from(JSON.stringify(value)).toString('base64'), encoding: 'base64' };
}

function githubRunner(kind = 'electron', release = {}) {
  const dependency = fixture.dependencies[kind];
  return vi.fn((args) => {
    const endpoint = args.at(-1);
    if (endpoint === 'repos/campfirium/foliole/pulls/42') {
      return { base: { ref: 'dev', sha: 'base-head' }, head: { sha: 'electron-head' }, number: 42 };
    }
    if (endpoint.includes('/pulls/42/files')) {
      return [[{ filename: 'package.json' }, { filename: 'package-lock.json' }]];
    }
    if (endpoint.includes('/contents/package.json')) {
      return encoded(endpoint.includes('electron-head') ? dependency.afterManifest : dependency.beforeManifest);
    }
    if (endpoint.includes('/contents/package-lock.json')) {
      return encoded(endpoint.includes('electron-head') ? dependency.afterLock : dependency.beforeLock);
    }
    if (endpoint === 'repos/electron/electron/releases/latest') {
      return { draft: false, prerelease: false, tag_name: 'v43.5.0', ...release };
    }
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  });
}

function npmRunner(latest = '43.5.0') {
  return vi.fn(() => ({
    'dist-tags': { latest },
    time: { [latest]: fixture.clock.publishedAt }
  }));
}

describe('Dependabot PR Electron eligibility adapter', () => {
  it('defers and then admits the same complete Electron PR at the exact boundary', () => {
    expect(resolveDependabotPrEligibility({
      config: { repository: 'campfirium/foliole' },
      now: fixture.clock.beforeBoundary,
      pr,
      runGh: githubRunner(),
      runNpm: npmRunner()
    })).toMatchObject({ kind: 'electron-deferred' });

    expect(resolveDependabotPrEligibility({
      config: { repository: 'campfirium/foliole' },
      now: fixture.clock.exactBoundary,
      pr,
      runGh: githubRunner(),
      runNpm: npmRunner()
    })).toMatchObject({
      eligibility: { classification: 'eligible', version: '43.5.0' },
      identity: { headSha: 'electron-head', prNumber: 42 },
      kind: 'electron-eligible'
    });
  });

  it('keeps a complete other dependency PR on the existing route', () => {
    expect(resolveDependabotPrEligibility({
      config: { repository: 'campfirium/foliole' },
      pr,
      runGh: githubRunner('other'),
      runNpm: () => { throw new Error('npm source must not be read'); }
    })).toMatchObject({ kind: 'other-dependency' });
  });

  it('fails closed on latest source disagreement', () => {
    expect(resolveDependabotPrEligibility({
      config: { repository: 'campfirium/foliole' },
      now: fixture.clock.exactBoundary,
      pr,
      runGh: githubRunner(),
      runNpm: npmRunner('43.4.1')
    })).toMatchObject({ kind: 'source-error', reason: 'version-mismatch' });
  });
});
