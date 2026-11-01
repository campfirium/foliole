/* global console */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { runAndroidDependencySecurity } from '../android/android-dependency-security.mjs';
import { captured, execute } from '../android/macos-a5-process.mjs';
import { collectSecurityMaintenance } from './security-maintenance.mjs';

export function verifyHostedSecurityTarget(root, expected, git = args => execFileSync('git', args,
  { cwd: root, encoding: 'utf8' }).trim()) {
  if (!/^[a-f0-9]{40}$/u.test(expected ?? '') || git(['rev-parse', 'HEAD']) !== expected) {
    throw new Error('Security collection requires the exact scheduled target SHA');
  }
}

export async function runHostedSecurityMaintenance({ root, output, expected,
  android = runAndroidDependencySecurity, aggregate = collectSecurityMaintenance,
  executeCommand = execute, captureCommand = captured }) {
  verifyHostedSecurityTarget(root, expected);
  mkdirSync(output, { recursive: true });
  const runId = 'resolved';
  const nativeReport = path.join(output, 'security-maintenance/android', runId, 'report.json');
  let nativeError;
  try {
    await android({ paths: { buildRoot: root, gradle: path.join(root, 'android/gradlew'),
      artifactsRoot: output, runId }, env: process.env, execute: executeCommand, captured: captureCommand });
  } catch (error) { nativeError = error.message; }
  const report = aggregate({ root, output, nativeReports: { 'android-maven': nativeReport } });
  report.hosted = { target: expected, runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT, nativeError };
  writeFileSync(path.join(output, 'coverage.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const output = path.resolve('.tmp/artifacts/security-maintenance/hosted');
  try {
    const report = await runHostedSecurityMaintenance({ root, output, expected: process.env.FOLIOLE_SECURITY_TARGET_SHA });
    console.log(JSON.stringify({ output, status: report.overallStatus, findings: report.findings.map(row => row.id),
      gaps: report.gaps.map(row => row.id) }));
    if (report.overallStatus !== 'clean') process.exitCode = 1;
  } catch (error) {
    mkdirSync(output, { recursive: true });
    writeFileSync(path.join(output, 'failure.json'), `${JSON.stringify({ status: 'error', requestedTarget: process.env.FOLIOLE_SECURITY_TARGET_SHA, reason: error.message })}\n`);
    console.error(error.message);
    process.exitCode = 1;
  }
}
