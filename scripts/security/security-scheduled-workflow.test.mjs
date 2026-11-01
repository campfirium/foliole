// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { parse } from 'yaml';
import { runHostedSecurityMaintenance, verifyHostedSecurityTarget } from './hosted-security-maintenance.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function repository() {
  const artifacts = path.resolve('.tmp/artifacts/T674/security-hosted-tests');
  mkdirSync(artifacts, { recursive: true });
  const root = mkdtempSync(path.join(artifacts, 'repo-'));
  roots.push(root);
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git(['init', '-q']);
  writeFileSync(path.join(root, 'source.txt'), 'candidate');
  git(['add', 'source.txt']);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'candidate']);
  return { root, expected: git(['rev-parse', 'HEAD']) };
}

it('runs the same exact security target when full admission skips, without changing full admission', () => {
  const workflow = parse(readFileSync('.github/workflows/t7-hosted-quality.yml', 'utf8'));
  const security = workflow.jobs.security_maintenance;
  expect(security.needs).toBeUndefined();
  expect(security.permissions.contents).toBe('write');
  const submission = security.steps.find(step => step.id === 'android_graph');
  expect(submission.uses).toContain('gradle/actions/dependency-submission@');
  expect(submission.with['dependency-resolution-task']).toBe('folioleSecurityDependencies');
  expect(submission.with['validate-wrappers']).toBe(true);
  expect(submission.with['additional-arguments']).toContain('--no-configuration-cache');
  expect(submission.with['additional-arguments']).toContain('android-dependency-inventory.gradle');
  expect(submission.with['dependency-graph']).toBe('generate-and-upload');
  expect(security.steps.find(step => step.id === 'android_submission').run).toBe('node scripts/android/android-dependency-submission.mjs');
  expect(security.steps.find(step => step.name === 'Collect current advisory and coverage evidence').env.FOLIOLE_ANDROID_SUBMISSION_RECEIPT)
    .toBe('.tmp/artifacts/security-maintenance/hosted/dependency-submission.json');
  expect(security.if).toBe("github.ref == 'refs/heads/dev'");
  expect(security['timeout-minutes']).toBe(20);
  expect(security.env.FOLIOLE_SECURITY_TARGET_SHA).toBe('${{ github.sha }}');
  expect(security.steps.find(step => step.uses === 'actions/checkout@v4').with.ref).toBe('${{ github.sha }}');
  const retained = security.steps.find(step => step.uses === 'actions/upload-artifact@v4');
  expect(retained.if).toBe('${{ always() }}');
  expect(retained.with['if-no-files-found']).toBe('error');
  expect(retained.with.name).toBe('security-maintenance-${{ github.sha }}-${{ github.run_attempt }}');
  expect(security.steps.some(step => step.if === '${{ always() }}' && step.run?.includes('collection-unavailable-see-job-log'))).toBe(true);
  expect(workflow.jobs.t6_quality.needs).toBe('context');
  expect(workflow.jobs.t6_quality.if).toBe("needs.context.outputs.should_run == 'true'");
  expect(workflow.jobs.skipped_notice.if).toBe("needs.context.outputs.should_run != 'true'");
});

it('rejects another revision before native or audit commands can run', async () => {
  const args = repository();
  expect(() => verifyHostedSecurityTarget(args.root, args.expected)).not.toThrow();
  expect(() => verifyHostedSecurityTarget(args.root, 'b'.repeat(40))).toThrow('exact scheduled target');
  let invoked = false;
  await expect(runHostedSecurityMaintenance({ ...args, expected: 'invalid', output: path.join(args.root, 'output'),
    android: () => { invoked = true; }, aggregate: () => { invoked = true; } })).rejects.toThrow('exact scheduled target');
  expect(invoked).toBe(false);
});

it('keeps independent audit results and a persisted source failure when native resolution fails', async () => {
  const args = repository();
  const output = path.join(args.root, 'output');
  let imported;
  const report = await runHostedSecurityMaintenance({ ...args, output,
    android: async () => { throw new Error('native resolution unavailable'); },
    aggregate: options => {
      imported = options.nativeReports['android-maven'];
      return { overallStatus: 'incomplete', findings: [{ id: 'npm-build' }], gaps: [{ id: 'android-maven' }] };
    } });
  expect(imported).toBe(path.join(output, 'security-maintenance/android/resolved/report.json'));
  expect(report.findings).toEqual([{ id: 'npm-build' }]);
  expect(report.hosted.nativeError).toBe('native resolution unavailable');
  expect(JSON.parse(readFileSync(path.join(output, 'coverage.json'), 'utf8')).hosted.target).toBe(args.expected);
});

it('refreshes iOS in the same independent security artifact even when the Android collector reports incomplete', () => {
  const job = parse(readFileSync('.github/workflows/t7-hosted-quality.yml', 'utf8')).jobs.security_maintenance;
  const collector = job.steps.findIndex(step => step.run === 'node scripts/security/hosted-security-maintenance.mjs');
  const refresh = job.steps.findIndex(step => step.run === 'node scripts/ios/hosted-ios-security-maintenance.mjs');
  const upload = job.steps.findIndex(step => step.uses === 'actions/upload-artifact@v4');
  expect(refresh).toBeGreaterThan(collector);
  expect(refresh).toBeLessThan(upload);
  expect(job.steps[refresh].if).toBe('${{ always() }}');
  expect(job.steps[refresh].env.GITHUB_TOKEN).toBe('${{ github.token }}');
  expect(job.needs).toBeUndefined();
});
