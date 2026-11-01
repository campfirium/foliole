/* global console */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { captureSecurityCandidate, sameSecurityCandidate } from '../security/security-inputs.mjs';
import { collectAndroidOfficialSecurity } from './android-official-security.mjs';
import { createAndroidSecurityReport } from './android-security-report.mjs';

export async function collectAndroidDependencySecurity({
  projectRoot, gradle, initScript, outputDir, env, execute, fetchImpl, source
}) {
  mkdirSync(outputDir, { recursive: true });
  const inventoryPath = path.join(outputDir, 'inventory.json');
  let report;
  try {
    const result = await execute(gradle, ['--no-daemon', '--no-configuration-cache', '--console=plain',
      '-I', initScript, 'folioleSecurityDependencies', `-PfolioleSecurityReport=${inventoryPath}`],
    { cwd: projectRoot, env, timeoutMs: 180_000 });
    writeFileSync(path.join(outputDir, 'gradle.log'), result.output);
    if (result.code !== 0) throw new Error('Gradle dependency inventory failed; see gradle.log');
    const raw = readFileSync(inventoryPath, 'utf8');
    report = await createAndroidSecurityReport(JSON.parse(raw), { fetchImpl,
      source: { ...source, inventorySha256: createHash('sha256').update(raw).digest('hex') } });
    report.officialObservations = await collectAndroidOfficialSecurity(report.inventory, { fetchImpl });
  } catch (error) {
    report = { schemaVersion: 1, platform: 'android', status: 'error', overallStatus: 'incomplete',
      coverage: 'partial', generatedAt: new Date().toISOString(), source,
      errors: [{ reason: error.message }], findings: [], gaps: [{ reason: 'inventory-or-source-unavailable' }] };
  }
  const reportPath = path.join(outputDir, 'report.json');
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { report, reportPath };
}

export async function runAndroidDependencySecurity({ paths, env, execute, captured, fetchImpl }) {
  const git = args => captured('git', args, { cwd: paths.buildRoot });
  const source = captureSecurityCandidate(paths.buildRoot, git);
  const { report, reportPath } = await collectAndroidDependencySecurity({
    projectRoot: path.join(paths.buildRoot, 'android'), gradle: paths.gradle,
    initScript: path.join(paths.buildRoot, 'scripts/android/android-dependency-inventory.gradle'),
    outputDir: path.join(paths.artifactsRoot, 'security-maintenance/android', paths.runId),
    env, execute, source, fetchImpl
  });
  if (!sameSecurityCandidate(source, captureSecurityCandidate(paths.buildRoot, git))) {
    report.status = 'error';
    report.errors.push({ reason: 'candidate-inputs-changed-during-extraction' });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify({ reportPath, status: report.status, overallStatus: report.overallStatus,
    packages: report.advisories?.results.length ?? 0, findings: report.findings.length,
    errors: report.errors.length, gaps: report.gaps.length }));
  if (report.status !== 'clean') throw new Error(`Android Maven check ${report.status}; report: ${reportPath}`);
}
