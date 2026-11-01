/* global console */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { captureSecurityCandidate, sameSecurityCandidate } from '../security/security-inputs.mjs';
import { collectAndroidDeviceNotices, readAndroidDeviceSecurity } from './android-device-security.mjs';
import { collectAndroidComponentNotices } from './android-component-notices.mjs';
import { inspectAndroidNativeComponents } from './android-native-components.mjs';
import { collectAndroidToolchainNotices } from './android-toolchain-notices.mjs';
import { collectAndroidOfficialSecurity } from './android-official-security.mjs';
import { createAndroidSecurityReport } from './android-security-report.mjs';

export async function collectAndroidDependencySecurity({
  projectRoot, gradle, initScript, outputDir, env, execute, fetchImpl, source, dependencyGraph = false
}) {
  mkdirSync(outputDir, { recursive: true });
  const inventoryPath = path.join(outputDir, 'inventory.json');
  let report;
  try {
    const result = await execute(gradle, ['--no-daemon', '--no-configuration-cache', '--console=plain',
      '-I', initScript, ...(dependencyGraph ? ['-I', path.join(path.dirname(initScript), 'android-dependency-graph.gradle')] : []), 'folioleSecurityDependencies', `-PfolioleSecurityReport=${inventoryPath}`],
    { cwd: projectRoot, env, timeoutMs: 180_000 });
    writeFileSync(path.join(outputDir, 'gradle.log'), result.output);
    if (result.code !== 0) throw new Error('Gradle dependency inventory failed; see gradle.log');
    const raw = readFileSync(inventoryPath, 'utf8');
    report = await createAndroidSecurityReport(JSON.parse(raw), { fetchImpl,
      source: { ...source, inventorySha256: createHash('sha256').update(raw).digest('hex') } });
    try { report.inventory.nativeComponents = inspectAndroidNativeComponents(report.inventory); }
    catch (error) { report.gaps.push({ asset: 'Embedded native identity', reason: error.message }); }
    report.officialObservations = await collectAndroidOfficialSecurity(report.inventory, { fetchImpl });
    report.officialObservations.push(await collectAndroidComponentNotices(report.inventory.nativeComponents, { fetchImpl }));
    report.officialObservations.push(...await collectAndroidToolchainNotices(report.inventory, { fetchImpl }));
    report.officialObservations.push(await collectAndroidDeviceNotices(readAndroidDeviceSecurity(path.dirname(projectRoot)), { fetchImpl }));
    report.officialObservations.push({ asset: 'android-maven', route: 'dependency-submission',
      checkedAt: new Date().toISOString(), source: 'https://github.com/gradle/actions/tree/v6.4.1/dependency-submission',
      status: env.FOLIOLE_ANDROID_GRAPH_STATUS === 'success' ? 'clean' : env.GITHUB_ACTIONS === 'true' ? 'error' : 'unsupported',
      reason: env.GITHUB_ACTIONS === 'true' ? `dependency-submission-${env.FOLIOLE_ANDROID_GRAPH_STATUS ?? 'missing'}` : 'submission-is-owned-by-hosted-scheduled-job',
      findings: [], evidence: { versions: { gradle: report.inventory.gradleVersion },
        outcome: env.FOLIOLE_ANDROID_GRAPH_STATUS, runId: env.GITHUB_RUN_ID } });
  } catch (error) {
    report = { schemaVersion: 1, platform: 'android', status: 'error', overallStatus: 'incomplete',
      coverage: 'partial', generatedAt: new Date().toISOString(), source,
      errors: [{ reason: error.message }], findings: [], gaps: [{ reason: 'inventory-or-source-unavailable' }] };
  }
  const reportPath = path.join(outputDir, 'report.json');
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { report, reportPath };
}

export async function runAndroidDependencySecurity({ paths, env, execute, captured, fetchImpl, dependencyGraph = false }) {
  const git = args => captured('git', args, { cwd: paths.buildRoot });
  const source = captureSecurityCandidate(paths.buildRoot, git);
  if (dependencyGraph) env = { ...env,
    GITHUB_DEPENDENCY_GRAPH_JOB_CORRELATOR: 'android-security',
    GITHUB_DEPENDENCY_GRAPH_JOB_ID: paths.runId,
    GITHUB_DEPENDENCY_GRAPH_REF: 'refs/heads/dev',
    GITHUB_DEPENDENCY_GRAPH_SHA: source.revision,
    GITHUB_DEPENDENCY_GRAPH_WORKSPACE: paths.buildRoot,
    DEPENDENCY_GRAPH_RUNTIME_INCLUDE_CONFIGURATIONS: '.*RuntimeClasspath',
    DEPENDENCY_GRAPH_REPORT_DIR: path.join(paths.artifactsRoot, 'security-maintenance/android', paths.runId, 'dependency-graph')
  };
  const { report, reportPath } = await collectAndroidDependencySecurity({
    projectRoot: path.join(paths.buildRoot, 'android'), gradle: paths.gradle,
    initScript: path.join(paths.buildRoot, 'scripts/android/android-dependency-inventory.gradle'),
    outputDir: path.join(paths.artifactsRoot, 'security-maintenance/android', paths.runId),
    env, execute, source, fetchImpl, dependencyGraph
  });
  if (!sameSecurityCandidate(source, captureSecurityCandidate(paths.buildRoot, git))) {
    report.status = 'error';
    report.errors.push({ reason: 'candidate-inputs-changed-during-extraction' });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify({ reportPath, status: report.status, overallStatus: report.overallStatus,
    packages: report.advisories?.results.length ?? 0, findings: report.findings.length,
    errors: report.errors.length, gaps: report.gaps.length,
    vendorChecks: report.officialObservations?.map(row => ({ asset: row.asset, route: row.route, status: row.status })) }));
  if (report.status !== 'clean') throw new Error(`Android Maven check ${report.status}; report: ${reportPath}`);
}
