// @vitest-environment node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createChainVerdict, fullChainStages } from './chain-verdict.mjs';
import { classifyReleasePath, evaluateBaselineEvidence, runReleaseQualityReuse } from './release-quality-reuse.mjs';

const repository = 'campfirium/foliole';
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function write(cwd, file, content) {
  fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
  fs.writeFileSync(path.join(cwd, file), typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
}

const lock = version => ({ name: 'foliole', version, lockfileVersion: 3,
  packages: { '': { name: 'foliole', version, dependencies: { a: '1.0.0' } }, 'node_modules/a': { version: '1.0.0' } } });

function repo() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'release-quality-reuse-'));
  roots.push(cwd);
  git(cwd, 'init', '-q', '-b', 'dev');
  git(cwd, 'config', 'user.email', 'test@example.invalid');
  git(cwd, 'config', 'user.name', 'Test');
  write(cwd, 'package.json', { name: 'foliole', version: '0.8.2', scripts: { test: 'vitest' } });
  write(cwd, 'package-lock.json', lock('0.8.2'));
  write(cwd, '.github/release-intent.json', { schemaVersion: 1, version: '0.8.2' });
  write(cwd, 'src/app/main.ts', 'export const a = 1;\n');
  write(cwd, 'src/shared/localization/locales/en.ts', 'export const en = { hi: "Hi" };\n');
  write(cwd, 'src/shared/localization/locales/de/settings.json', { hi: 'Hallo' });
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-qm', 'base');
  return { cwd, base: git(cwd, 'rev-parse', 'HEAD') };
}

function release(cwd, base, edit = () => {}, baseline = { runId: '77', sha: base }) {
  write(cwd, 'package.json', { name: 'foliole', version: '0.8.3', scripts: { test: 'vitest' } });
  write(cwd, 'package-lock.json', lock('0.8.3'));
  write(cwd, '.github/release-intent.json', { schemaVersion: 1, version: '0.8.3',
    ...(baseline ? { qualityBaseline: baseline } : {}) });
  edit(cwd);
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-qm', 'release');
  return git(cwd, 'rev-parse', 'HEAD');
}

function evidence(sha, { lane = 'dev-remote', selection = 'all', path: workflowPath = '.github/workflows/remote-quality.yml',
  failed = false, conclusion = 'success', headSha = sha } = {}) {
  const stages = selection === 'all' ? fullChainStages(lane) : [selection];
  const needs = Object.fromEntries(stages.map((stage, index) => [stage, {
    result: failed && index === 0 ? 'failure' : 'success', outputs: { accepted_sha: sha }
  }]));
  return {
    run: { id: 77, run_attempt: 1, status: 'completed', conclusion, path: workflowPath, head_sha: headSha,
      repository: { full_name: repository } },
    artifact: { id: 9, name: 'chain-verdict-77-1', expired: false, workflow_run: { id: 77 } },
    receipt: createChainVerdict({ selection, targetSha: sha, needs, runId: 77, runAttempt: 1, lane })
  };
}

function decide(cwd, target, readEvidence, scope = '["macos","windows","linux","ios"]') {
  return runReleaseQualityReuse({ cwd, env: { TARGET_SHA: target, GITHUB_REPOSITORY: repository,
    ...(scope === null ? {} : { RELEASE_SCOPE_JSON: scope }) }, readEvidence });
}

describe('release quality reuse', () => {
  it('reuses a passed QA full chain when only version and intent changed', () => {
    const { cwd, base } = repo();
    const target = release(cwd, base);
    const result = decide(cwd, target, ({ runId }) => { expect(runId).toBe('77'); return evidence(base); });
    expect(result).toMatchObject({ reuse: true, localizationChanged: false });
  });

  it('allows docs, release notes and generated translations, flagging the localization check', () => {
    const { cwd, base } = repo();
    const target = release(cwd, base, root => {
      write(root, 'docs/guide.md', '# guide\n');
      write(root, 'releases/notes/0.8.3.md', 'notes\n');
      write(root, 'src/shared/localization/locales/de/settings.json', { hi: 'Servus' });
      write(root, 'src/shared/localization/locales/ja/settings.json', { hi: 'こんにちは' });
    });
    expect(decide(cwd, target, () => evidence(base))).toMatchObject({ reuse: true, localizationChanged: true });
  });

  it.each([
    ['product code', root => write(root, 'src/app/main.ts', 'export const a = 2;\n')],
    ['English source copy', root => write(root, 'src/shared/localization/locales/en.ts', 'export const en = { hi: "Hey" };\n')],
    ['Simplified Chinese source', root => write(root, 'src/shared/localization/locales/zhHans.ts', 'export const zh = {};\n')],
    ['a workflow', root => write(root, '.github/workflows/t7-release.yml', 'name: x\n')],
    ['a package script', root => write(root, 'package.json', { name: 'foliole', version: '0.8.3', scripts: { test: 'jest' } })],
    ['a dependency', root => write(root, 'package-lock.json', { ...lock('0.8.3'), packages: { ...lock('0.8.3').packages, 'node_modules/a': { version: '1.0.1' } } })],
    ['a nested locale path', root => write(root, 'src/shared/localization/locales/de/nested/settings.json', {})]
  ])('falls back to the full chain when the candidate changes %s', (_, edit) => {
    const { cwd, base } = repo();
    const target = release(cwd, base, edit);
    const result = decide(cwd, target, () => { throw new Error('evidence must not be read'); });
    expect(result.reuse).toBe(false);
    expect(result.reason).toContain('more than release content');
  });

  it('falls back without a baseline or when the baseline is not an ancestor', () => {
    const { cwd, base } = repo();
    const noBaseline = release(cwd, base, undefined, null);
    expect(decide(cwd, noBaseline, () => evidence(base)).reason).toContain('names no quality baseline');
    const orphan = 'f'.repeat(40);
    write(cwd, '.github/release-intent.json', { schemaVersion: 1, version: '0.8.3', qualityBaseline: { runId: '77', sha: orphan } });
    git(cwd, 'commit', '-qam', 'bad baseline');
    expect(decide(cwd, git(cwd, 'rev-parse', 'HEAD'), () => evidence(orphan)).reason).toContain('not an ancestor');
  });

  it('runs the full chain for an Android release, which Play registers only from its own full chain', () => {
    const { cwd, base } = repo();
    const target = release(cwd, base);
    const result = decide(cwd, target, () => { throw new Error('evidence must not be read'); },
      '["macos","windows","linux","android","ios"]');
    expect(result).toMatchObject({ reuse: false, localizationChanged: false });
    expect(result.reason).toContain('release scope includes android');
  });

  it.each([null, '', 'android', '[]', '[""]', '{"android":true}'])(
    'refuses to decide without a readable release scope (%s)', scope => {
      const { cwd, base } = repo();
      const target = release(cwd, base);
      expect(() => decide(cwd, target, () => evidence(base), scope)).toThrow('RELEASE_SCOPE_JSON');
    });

  it('rejects a malformed baseline instead of guessing', () => {
    const { cwd, base } = repo();
    const target = release(cwd, base, undefined, { runId: 'latest', sha: base });
    expect(() => decide(cwd, target, () => evidence(base))).toThrow('qualityBaseline');
  });
});

describe('baseline evidence', () => {
  const sha = 'a'.repeat(40);
  const baseline = { runId: '77', sha };
  const check = value => evaluateBaselineEvidence({ evidence: value, baseline, repository });

  it('accepts QA, mobile QA and scheduled dev full passes', () => {
    expect(check(evidence(sha))).toBeNull();
    expect(check(evidence(sha, { lane: 'qa-mobile-beta' }))).toBeNull();
    expect(check(evidence(sha, { lane: 'dev-t7', path: '.github/workflows/t7-hosted-quality.yml' }))).toBeNull();
  });

  it.each([
    ['a failed chain', evidence(sha, { failed: true, conclusion: 'failure' })],
    ['a cancelled run', evidence(sha, { conclusion: 'cancelled' })],
    ['a partial replay', evidence(sha, { selection: 't5-shared' })],
    ['an unrelated workflow', evidence(sha, { path: '.github/workflows/ci.yml' })],
    ['a release lane receipt', evidence(sha, { lane: 'release-t7' })],
    ['a run on another commit', evidence(sha, { headSha: 'b'.repeat(40) })],
    ['an expired receipt', { ...evidence(sha), artifact: { ...evidence(sha).artifact, expired: true } }],
    ['a missing receipt', { run: evidence(sha).run }],
    ['another repository', { ...evidence(sha), run: { ...evidence(sha).run, repository: { full_name: 'other/foliole' } } }]
  ])('rejects %s', (_, value) => {
    expect(check(value)).toEqual(expect.any(String));
  });

  it('classifies only release content as reusable', () => {
    expect(classifyReleasePath('.github/release-intent.json')).toBe('release');
    expect(classifyReleasePath('src/shared/localization/locales/ptBR/settings.json')).toBe('localization');
    expect(classifyReleasePath('src/shared/localization/locales/en/settings.json')).toBe('other');
    expect(classifyReleasePath('src/shared/localization/locales/de.ts')).toBe('other');
    expect(classifyReleasePath('lib/core/localization/appLocaleManifest.json')).toBe('other');
  });
});
