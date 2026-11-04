// @vitest-environment node
import process from 'node:process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { parse } from 'yaml';
import { parseRemoteQualityArgs } from '../quality/remote-quality-args.mjs';
import { parseRemoteQualityRun } from '../quality/remote-quality-run-title.mjs';

const remote = parse(readFileSync('.github/workflows/remote-quality.yml', 'utf8'));
const workflow = parse(readFileSync('.github/workflows/release-android.yml', 'utf8'));
const evaluate = (expression, context) => runInNewContext(expression
  .replace(/^\$\{\{|\}\}$/gu, '').replace(/needs\.([\w-]+)/gu, 'needs["$1"]'), context);

it('admits Android only after full QA accepted the exact registered check candidate', () => {
  expect(parseRemoteQualityArgs(['--scope', 'full', '--mobile-distribution', 'android'])).toMatchObject({ mobileDistribution: 'android' });
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  expect(parseRemoteQualityRun({ display_title: `Dev Quality Check (full) @ ${sha.slice(0, 9)} [mobile:android]`, head_sha: sha }))
    .toMatchObject({ mobileDistribution: 'android', testedSha: sha });
  for (const mode of ['none', 'ios', 'android']) for (const result of ['success', 'failure', 'cancelled', 'skipped']) {
    const context = { always: () => true, inputs: { mobile_distribution: mode }, needs: { 'mobile-context': { result } } };
    expect(evaluate(remote.jobs['mobile-android'].if, context)).toBe(mode === 'android' && result === 'success');
  }
  const guard = remote.jobs['dev-ref'].steps.find(step => step.env?.MOBILE);
  for (const [ref, scope, allowed] of [['check', 'full', true], ['dev', 'full', false], ['check', 'android', false]]) {
    const result = spawnSync('bash', ['-e', '-c', guard.run], { env: { GITHUB_REF: `refs/heads/${ref}`, SCOPE: scope, MOBILE: 'android' } });
    expect(result.status === 0).toBe(allowed);
  }
});

it('executes the real Android candidate guard before credentials or build and rejects changed identity', () => {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const version = JSON.parse(readFileSync('package.json')).version;
  const env = { GITHUB_REF: 'refs/heads/check', TRIGGER_REF: 'refs/heads/check', EXECUTION_LANE: 'qa-mobile-beta',
    TARGET_SHA: sha, ACCEPTED_SHA: sha, GITHUB_SHA: sha, TARGET_VERSION: version, GITHUB_RUN_ID: '42' };
  const guard = workflow.jobs.play.steps.find(step => step.name === 'Require exact accepted QA identity');
  const run = change => spawnSync('bash', ['-e', '-c', guard.run], { env: { ...process.env, ...env, ...change } });
  expect(run({}).status).toBe(0);
  for (const change of [{ GITHUB_REF: 'refs/heads/dev' }, { TRIGGER_REF: 'refs/heads/release' },
    { EXECUTION_LANE: 'release-t7' }, { TARGET_SHA: 'b'.repeat(40) }, { ACCEPTED_SHA: 'b'.repeat(40) },
    { GITHUB_SHA: 'b'.repeat(40) }, { TARGET_VERSION: '0.0.0' }, { GITHUB_RUN_ID: '' }]) {
    expect(run(change).status).not.toBe(0);
  }
});

it('isolates signing and API secrets from package scripts and preserves the signed checkpoint before upload', () => {
  const job = workflow.jobs.play;
  expect(job.concurrency).toEqual({ group: 'play-android-open-testing', 'cancel-in-progress': false });
  expect(Object.keys(job.env)).not.toContain('ANDROID_PLAY_SERVICE_ACCOUNT_JSON');
  const steps = job.steps;
  const upload = steps.findIndex(step => step.run?.endsWith('play-release.mjs upload'));
  expect(steps[upload - 1].uses).toBe('actions/upload-artifact@v4');
  expect(steps[upload - 1].with.path).toContain('app-release-signed.aab');
  for (const step of steps.filter(item => item.env)) {
    if (Object.keys(step.env).some(key => key.startsWith('ANDROID_UPLOAD'))) {
      expect(step.run).toBe('node scripts/android/play-release.mjs sign');
    }
    if ('ANDROID_PLAY_SERVICE_ACCOUNT_JSON' in step.env) {
      expect(step.run).toMatch(/^node scripts\/android\/play-release.mjs (prepare|upload|commit|observe)$/u);
    }
  }
  const context = { inputs: { mobile_distribution: 'android' }, github: { ref: 'refs/heads/check' } };
  expect(evaluate(remote.concurrency['cancel-in-progress'], context)).toBe(false);
  expect(workflow.on.workflow_dispatch).toBeUndefined();
});


it.runIf(process.platform !== 'win32').each(['release-android.yml', 'hosted-quality-android-host.yml'])(
  'installs the pinned NDK through the configured SDK when sdkmanager is absent from PATH: %s', name => {
    mkdirSync('.tmp/artifacts/T251-13', { recursive: true });
    const root = mkdtempSync(path.resolve('.tmp/artifacts/T251-13/sdk-tool-'));
    try {
      const directory = path.join(root, 'cmdline-tools/latest/bin');
      mkdirSync(directory, { recursive: true });
      const request = path.join(root, 'request');
      writeFileSync(path.join(directory, 'sdkmanager'), '#!/bin/sh\nprintf "%s" "$1" > "$SDK_REQUEST"\n', { mode: 0o700 });
      const source = parse(readFileSync(`.github/workflows/${name}`, 'utf8'));
      const step = Object.values(source.jobs).flatMap(job => job.steps ?? [])
        .find(item => item.run?.includes('sdkmanager'));
      const result = spawnSync('/bin/bash', ['-e', '-c', step.run], {
        env: { ANDROID_HOME: root, PATH: root, SDK_REQUEST: request }, encoding: 'utf8'
      });
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(request, 'utf8')).toBe('ndk;25.2.9519653');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
