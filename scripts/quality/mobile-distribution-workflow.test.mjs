// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import process from 'node:process';
import { expect, it } from 'vitest';
import { parse } from 'yaml';

const remote = parse(readFileSync('.github/workflows/remote-quality.yml', 'utf8'));
const signing = parse(readFileSync('.github/workflows/release-ios.yml', 'utf8'));
const evaluate = (expression, context) => runInNewContext(expression
  .replace(/^\$\{\{|\}\}$/gu, '').replace(/needs\.([\w-]+)/gu, 'needs["$1"]'), context);
const guard = remote.jobs['dev-ref'].steps.find(step => step.env?.MOBILE);
const execute = (step, env) => spawnSync('bash', ['-e', '-c', step.run], {
  env: { ...process.env, ...env }, encoding: 'utf8'
});

it('allows normal quality but requires full check QA for any mobile side effect', () => {
  for (const GITHUB_REF of ['refs/heads/dev', 'refs/heads/check']) {
    expect(execute(guard, { GITHUB_REF, MOBILE: 'none', SCOPE: 'ios' }).status).toBe(0);
  }
  expect(execute(guard, { GITHUB_REF: 'refs/heads/check', MOBILE: 'ios', SCOPE: 'full' }).status).toBe(0);
  for (const env of [{ GITHUB_REF: 'refs/heads/dev' }, { SCOPE: 'ios' }, { MOBILE: 'windows' }]) {
    expect(execute(guard, { GITHUB_REF: 'refs/heads/check', MOBILE: 'ios', SCOPE: 'full', ...env }).status).not.toBe(0);
  }
});

it('requires successful full quality or verified reuse before mobile signing', () => {
  expect(remote.on.workflow_dispatch.inputs.mobile_distribution.default).toBe('none');
  const context = { always: () => true, inputs: { mobile_distribution: 'none', scope: 'full' },
    needs: { 'mobile-context': { result: 'success' } } };
  expect(evaluate(remote.jobs['mobile-ios'].if, context)).toBe(false);
  for (const scope of ['full', 'ios']) {
    for (const full of ['success', 'failure', 'skipped', 'cancelled']) {
      for (const reuse of ['success', 'failure', 'skipped', 'cancelled']) {
        const admitted = scope === 'full' && (full === 'success' || reuse === 'success');
        const needs = { 'full-quality': { result: full }, 'mobile-reuse': { result: reuse } };
        const inputs = { mobile_distribution: 'ios', scope };
        expect(evaluate(remote.jobs['mobile-context'].if, { ...context, inputs, needs })).toBe(admitted);
        needs['mobile-context'] = { result: admitted ? 'success' : 'skipped' };
        expect(evaluate(remote.jobs['mobile-ios'].if, { ...context, inputs, needs })).toBe(admitted);
      }
    }
  }
  expect(remote.jobs['mobile-ios'].needs).toContain('mobile-context');
  expect(remote.jobs['mobile-ios'].with.target_sha).toBe('${{ needs.full-quality.outputs.accepted_sha || needs.mobile-reuse.outputs.accepted_sha }}');
  expect(remote.jobs['mobile-ios'].with.execution_lane).toBe('qa-mobile-beta');
  expect(remote.jobs['mobile-ios'].uses).toBe('./.github/workflows/release-ios.yml');
  expect(remote.permissions.contents).toBe('read');
});

it('serializes distribution requests without letting ordinary QA cancel an upload', () => {
  const context = mode => ({ github: { ref: 'refs/heads/check' }, inputs: { mobile_distribution: mode } });
  expect(evaluate(remote.concurrency.group, context('ios'))).not.toBe(evaluate(remote.concurrency.group, context('none')));
  expect(evaluate(remote.concurrency['cancel-in-progress'], context('ios'))).toBe(false);
  expect(evaluate(remote.concurrency['cancel-in-progress'], context('none'))).toBe(true);
  expect(signing.jobs['signed-upload'].concurrency).toEqual({ group: 'testflight-ios-sign-upload', 'cancel-in-progress': false });
});

it('executes the signing guard for both authorized lanes and rejects mismatched source or branch', () => {
  const step = signing.jobs['signed-upload'].steps.find(entry => entry.env?.EXECUTION_LANE);
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const base = { TARGET_SHA: sha, GITHUB_SHA: sha, TARGET_VERSION: version };
  for (const [EXECUTION_LANE, GITHUB_REF] of [['release-t7', 'refs/heads/release'], ['qa-mobile-beta', 'refs/heads/check']]) {
    const env = { ...base, EXECUTION_LANE, GITHUB_REF, TRIGGER_REF: GITHUB_REF };
    expect(execute(step, env).status).toBe(0);
    for (const change of [{ TARGET_SHA: 'b'.repeat(40) }, { GITHUB_SHA: 'b'.repeat(40) },
      { GITHUB_REF: 'refs/heads/dev' }, { EXECUTION_LANE: 'dev-remote' }, { TARGET_VERSION: '0.0.0' }]) {
      expect(execute(step, { ...env, ...change }).status).not.toBe(0);
    }
  }
});

it('rejects a quality receipt for another commit before resolving the upload context', () => {
  const step = remote.jobs['mobile-context'].steps.find(entry => entry.id === 'identity');
  expect(execute(step, { ACCEPTED_SHA: 'a'.repeat(40), TARGET_SHA: 'b'.repeat(40) }).status).not.toBe(0);
});
