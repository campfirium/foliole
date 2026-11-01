/* global console */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { verifyHostedSecurityTarget } from '../security/hosted-security-maintenance.mjs';
import { collectIosSecurityMaintenance } from './ios-security-maintenance.mjs';
import { mergeIosSecurityCoverage } from './ios-security-coverage.mjs';

// Called within the existing scheduled job before its existing artifact upload/import.
export async function runHostedIosSecurityMaintenance({ root, output, expected, token,
  collect = collectIosSecurityMaintenance }) {
  verifyHostedSecurityTarget(root, expected);
  const iosOutput = path.join(output, 'ios');
  mkdirSync(iosOutput, { recursive: true });
  const baseFile = path.join(output, 'coverage.json');
  if (!existsSync(baseFile)) throw new Error('Existing scheduled coverage report is unavailable; retain the original setup failure');
  const base = JSON.parse(readFileSync(baseFile, 'utf8'));
  if (base.snapshot?.candidate?.revision !== expected) throw new Error('Scheduled base report candidate mismatch');
  const receipt = await collect({ root, output: iosOutput, token });
  const combined = mergeIosSecurityCoverage(base, receipt);
  writeFileSync(baseFile, `${JSON.stringify(combined, null, 2)}\n`);
  return combined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const output = path.resolve('.tmp/artifacts/security-maintenance/hosted');
  try {
    const report = await runHostedIosSecurityMaintenance({ root, output,
      expected: process.env.FOLIOLE_SECURITY_TARGET_SHA,
      token: process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN });
    console.log(JSON.stringify({ status: report.overallStatus, ios: report.ios }));
    process.exitCode = report.overallStatus === 'clean' ? 0 : 1;
  } catch (error) {
    mkdirSync(path.join(output, 'ios'), { recursive: true });
    writeFileSync(path.join(output, 'ios/failure.json'), `${JSON.stringify({ status: 'error', reason: error.message })}\n`);
    console.error(error.message);
    process.exitCode = 1;
  }
}
