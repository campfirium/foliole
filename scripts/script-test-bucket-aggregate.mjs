/* global console, process */

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { GATE_INTEGRATION_SCRIPT_NAMES } from './script-test-bucket-selection.mjs';

const DEFAULT_AGGREGATE_MAX_JOBS = 4;

function terminateChildTree(child) {
  if (!child.pid) {
    child.kill('SIGTERM');
    return;
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', timeout: 1000 });
    return;
  }
  child.kill('SIGTERM');
  globalThis.setTimeout(() => child.kill('SIGKILL'), 1000).unref();
}

function scriptResultToAssertion({ code, scriptName }) {
  return {
    ancestorTitles: ['script test bucket aggregate'],
    failureMessages: code === 0 ? [] : [`${scriptName} exited with code ${code}`],
    fullName: `script test bucket aggregate ${scriptName}`,
    status: code === 0 ? 'passed' : 'failed',
    title: scriptName
  };
}

export function writeAggregateReport(reportPath, results) {
  mkdirSync(path.dirname(reportPath), { recursive: true });
  const now = Date.now();
  const failed = results.filter((result) => result.code !== 0);
  const report = {
    numFailedTestSuites: failed.length > 0 ? 1 : 0,
    numFailedTests: failed.length,
    numPassedTestSuites: failed.length > 0 ? 0 : 1,
    numPassedTests: results.length - failed.length,
    numPendingTestSuites: 0,
    numPendingTests: 0,
    numRuntimeErrorTestSuites: 0,
    numTodoTests: 0,
    numTotalTestSuites: 1,
    numTotalTests: results.length,
    openHandles: [],
    snapshot: {},
    startTime: now,
    success: failed.length === 0,
    testResults: [
      {
        assertionResults: results.map(scriptResultToAssertion),
        endTime: now,
        message: failed.length === 0 ? '' : `${failed.length} quality gate integration bucket(s) failed.`,
        name: 'scripts/run-script-test-bucket.mjs:gate-integration',
        startTime: now,
        status: failed.length === 0 ? 'passed' : 'failed',
        summary: results.map((result) => `${result.scriptName}: ${result.code}`).join('\n')
      }
    ],
    wasInterrupted: false
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function runPackageScript(scriptName, timeoutMs) {
  return new Promise((resolve) => {
    const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
    const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm', 'run', scriptName] : ['run', scriptName];
    const child = spawn(command, args, { env: process.env, stdio: 'inherit' });
    let settled = false;
    const finish = (code) => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timer);
      resolve(code);
    };
    const timer = globalThis.setTimeout(() => {
      console.error(`[script-test-bucket] ${scriptName} exceeded aggregate timeout budget`);
      terminateChildTree(child);
      finish(1);
    }, timeoutMs);
    timer.unref();
    child.on('close', (code) => finish(code ?? 1));
  });
}

function resolveAggregateMaxJobs() {
  const parsed = Number.parseInt(process.env.SCRIPT_TEST_BUCKET_AGGREGATE_MAX_JOBS ?? `${DEFAULT_AGGREGATE_MAX_JOBS}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_AGGREGATE_MAX_JOBS;
}

export async function runIntegrationAggregate(reportPath, timeoutSeconds, scriptNames = GATE_INTEGRATION_SCRIPT_NAMES) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  const results = [];
  const running = new Set();
  for (const scriptName of scriptNames) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      results.push({ code: 1, scriptName });
      continue;
    }
    const run = runPackageScript(scriptName, remainingMs).then((code) => {
      results.push({ code, scriptName });
      running.delete(run);
    });
    running.add(run);
    if (running.size >= resolveAggregateMaxJobs()) {
      await Promise.race(running);
    }
  }
  await Promise.all(running);
  writeAggregateReport(reportPath, results);
  return results.some((result) => result.code !== 0) ? 1 : 0;
}
