import fs from 'node:fs';
import path from 'node:path';

export function assertRemediationPerformanceResult(result) {
  if (result?.status !== 'passed' || result.scenario !== 'remediation-performance'
    || result.appId !== 'com.campfirium.foliole.android.acceptance' || result.platform !== 'android'
    || result.cleanup !== true || result.fixtureNodes !== 1000
    || result.scan?.scanDiscardedForWrite !== true || result.scan?.queryCount > 131 || result.scan?.references !== 1
    || result.mixed?.fullReads !== 0 || result.mixed?.snapshotMatches !== true
    || result.details?.queryCount !== 1 || result.details?.expandedNodes !== 500
    || result.details?.detailsMatch !== true) throw new Error('Remediation measurement assertions failed');
  for (const value of [result.scan.queryCount, result.scan.scanMs, result.scan.scoreWaitAndWriteMs,
    result.mixed.elapsedMs, result.details.elapsedMs]) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error('Remediation measurement is missing or invalid');
    }
  }
}

export async function saveRemediationPerformanceResult({ result, execute, paths, serial, options, evidenceRoot }) {
  fs.writeFileSync(path.join(evidenceRoot, 'remediation-performance-instrumentation.log'), result.output);
  if (!/OK \(1 test\)/u.test(result.output) || /FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=/u.test(result.output)) {
    throw new Error('Remediation performance instrumentation failed');
  }
  const artifact = await execute(paths.adb, ['-s', serial, 'exec-out', 'run-as',
    'com.campfirium.foliole.android.acceptance', 'cat', 'files/remediation-performance-result.json'], options);
  if (artifact.code !== 0) throw new Error('Remediation result could not be read');
  const evidencePath = path.join(evidenceRoot, 'remediation-performance-result.json');
  fs.writeFileSync(evidencePath, artifact.output);
  assertRemediationPerformanceResult(JSON.parse(artifact.output));
  return { evidencePath, output: result.output };
}
