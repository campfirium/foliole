/* global console */

import { readFileSync } from 'node:fs';
import path from 'node:path';

export function readVitestReport(reportPath) {
  try {
    return JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch {
    return null;
  }
}

export function collectFileTotals(report) {
  const results = report?.testResults ?? [];
  return {
    passed: results.filter((result) => result.status === 'passed').length,
    total: results.length
  };
}

function normalizeTestPath(filePath) {
  return path.resolve(filePath).replaceAll('\\', '/');
}

export function validateExpectedTestFiles(report, serializedExpectedFiles) {
  if (!serializedExpectedFiles) {
    return true;
  }
  const requested = JSON.parse(serializedExpectedFiles).map(normalizeTestPath);
  const results = report?.testResults ?? [];
  const collected = results.map((result) => normalizeTestPath(result.name));
  const executed = results
    .filter((result) => result.assertionResults?.some((assertion) =>
      assertion.status === 'passed' || assertion.status === 'failed'
    ))
    .map((result) => normalizeTestPath(result.name));
  const requestedSet = new Set(requested);
  const collectedSet = new Set(collected);
  const executedSet = new Set(executed);
  const uncollected = requested.filter((file) => !collectedSet.has(file));
  const unexecuted = requested.filter((file) => !executedSet.has(file));
  const unexpected = collected.filter((file) => !requestedSet.has(file));

  console.log(
    `[vitest-summary] explicit files: requested ${requestedSet.size}, collected ${collectedSet.size}, executed ${executedSet.size}`
  );
  if (unexecuted.length === 0 && unexpected.length === 0 && requested.length === requestedSet.size) {
    return true;
  }
  for (const file of uncollected) console.error(`[vitest-summary] requested file not collected: ${file}`);
  for (const file of unexecuted.filter((file) => collectedSet.has(file))) {
    console.error(`[vitest-summary] requested file did not execute tests: ${file}`);
  }
  for (const file of unexpected) console.error(`[vitest-summary] unexpected file collected: ${file}`);
  return false;
}
