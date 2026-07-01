import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function emptyReport() {
  return {
    numFailedTestSuites: 0,
    numFailedTests: 0,
    numPassedTestSuites: 0,
    numPassedTests: 0,
    numPendingTestSuites: 0,
    numPendingTests: 0,
    numRuntimeErrorTestSuites: 0,
    numTodoTests: 0,
    numTotalTestSuites: 0,
    numTotalTests: 0,
    startTime: Date.now(),
    success: true,
    testResults: []
  };
}

export function readReport(reportPath) {
  try {
    return JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch {
    return null;
  }
}

function addNumber(left, right, key) {
  return (left[key] ?? 0) + (right?.[key] ?? 0);
}

export function combineReports(reportPath, buckets) {
  const reports = buckets.map((bucket) => readReport(bucket.report)).filter(Boolean);
  const combined = reports.reduce((acc, report) => ({
    numFailedTestSuites: addNumber(acc, report, 'numFailedTestSuites'),
    numFailedTests: addNumber(acc, report, 'numFailedTests'),
    numPassedTestSuites: addNumber(acc, report, 'numPassedTestSuites'),
    numPassedTests: addNumber(acc, report, 'numPassedTests'),
    numPendingTestSuites: addNumber(acc, report, 'numPendingTestSuites'),
    numPendingTests: addNumber(acc, report, 'numPendingTests'),
    numRuntimeErrorTestSuites: addNumber(acc, report, 'numRuntimeErrorTestSuites'),
    numTodoTests: addNumber(acc, report, 'numTodoTests'),
    numTotalTestSuites: addNumber(acc, report, 'numTotalTestSuites'),
    numTotalTests: addNumber(acc, report, 'numTotalTests'),
    startTime: Math.min(acc.startTime ?? Number.POSITIVE_INFINITY, report.startTime ?? Number.POSITIVE_INFINITY),
    success: (acc.success ?? true) && report.success !== false,
    testResults: [...(acc.testResults ?? []), ...(report.testResults ?? [])]
  }), emptyReport());
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(combined, null, 2)}\n`, 'utf8');
}

export function writeBucketFailureReport(bucket, message) {
  const now = Date.now();
  const report = {
    ...emptyReport(),
    numFailedTestSuites: 1,
    numFailedTests: 1,
    numTotalTestSuites: bucket.targets.length,
    numTotalTests: 1,
    success: false,
    testResults: [{
      assertionResults: [{
        ancestorTitles: ['desktop electron test bucket'],
        failureMessages: [message],
        fullName: `desktop electron test bucket ${bucket.label} wrote a report`,
        status: 'failed',
        title: `${bucket.label} wrote a report`
      }],
      endTime: now,
      message,
      name: `scripts/run-desktop-electron-test-bucket.mjs:${bucket.label}`,
      startTime: now,
      status: 'failed',
      summary: message
    }]
  };
  mkdirSync(path.dirname(bucket.report), { recursive: true });
  writeFileSync(bucket.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

export function removeOldReports(reportPath, buckets) {
  for (const report of [reportPath, ...buckets.map((bucket) => bucket.report)]) {
    rmSync(report, { force: true });
  }
}
