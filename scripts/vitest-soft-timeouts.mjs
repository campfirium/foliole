/* global console, process */

import { appendFileSync } from 'node:fs';

// Time limits only stop hangs; exceeding a test's calibrated time warns instead of failing.
export const HANG_CAP_MS = 600_000;
const VITEST_DEFAULT_TIMEOUT_MS = 5_000;
const TIMEOUT_FLAGS = ['--testTimeout', '--hookTimeout'];
const VALUE_FLAGS = new Set([
  '--maxWorkers', '--pool', '--project', '--config', '-c', '--dir', '--root', '-r', '--environment',
  '-t', '--testNamePattern', '--shard', '--exclude', ...TIMEOUT_FLAGS
]);
const TIMEOUT_FAILURE = /timed out|timeout/iu;

export function applyHangCap(args) {
  let calibratedDefaultMs = VITEST_DEFAULT_TIMEOUT_MS;
  const capped = [];
  for (let index = 0; index < args.length; index += 1) {
    const [flag, inline] = args[index].split('=', 2);
    if (!TIMEOUT_FLAGS.includes(flag)) {
      capped.push(args[index]);
      continue;
    }
    const value = inline ?? args[(index += 1)];
    if (flag === '--testTimeout') calibratedDefaultMs = Number(value) || calibratedDefaultMs;
  }
  return {
    args: [...capped, `--testTimeout=${HANG_CAP_MS}`, `--hookTimeout=${HANG_CAP_MS}`],
    calibratedDefaultMs
  };
}

function assertions(report) {
  return (report?.testResults ?? []).flatMap((result) => (result.assertionResults ?? [])
    .map((assertion) => ({ ...assertion, file: result.name })));
}

export function findCalibrationWarnings(report, calibratedDefaultMs) {
  return assertions(report).flatMap((assertion) => {
    const calibratedMs = Number(assertion.meta?.calibratedMs) || calibratedDefaultMs;
    return assertion.status === 'passed' && assertion.duration > calibratedMs
      ? [{ ...assertion, calibratedMs }] : [];
  });
}

// Reruns only timeout failures and calibration warnings; any other failure stays red at once.
export function planRerun(report, warnings) {
  if (!report) return [];
  const failed = assertions(report).filter((assertion) => assertion.status === 'failed');
  const fileFailures = report.testResults.filter((result) => result.status === 'failed' &&
    !(result.assertionResults ?? []).some((assertion) => assertion.status === 'failed'));
  if (fileFailures.length || failed.some((assertion) => !isTimeoutFailure(assertion))) return [];
  return [...failed, ...warnings];
}

function isTimeoutFailure(assertion) {
  return (assertion.failureMessages ?? []).some((message) => TIMEOUT_FAILURE.test(message.split('\n', 1)[0]));
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

export function rerunArgs(args, targets) {
  const kept = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (VALUE_FLAGS.has(arg)) {
      if (arg !== '-t' && arg !== '--testNamePattern') kept.push(arg, args[index + 1]);
      index += 1;
    } else if (arg.startsWith('-') && !arg.startsWith('--testNamePattern=')) {
      kept.push(arg);
    }
  }
  const files = [...new Set(targets.map((target) => target.file))];
  const titles = [...new Set(targets.map((target) => escapeRegExp(target.title)))];
  return [...kept, `--testNamePattern=${titles.join('|')}`, ...files];
}

export function reportSoftTimeouts(lines) {
  for (const line of lines) console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY && lines.length) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.map((line) => `- ${line.replace(/^::warning::/u, '')}`).join('\n')}\n`);
  }
}

export const warningLines = (warnings, prefix) => warnings.map((warning) =>
  `::warning::${prefix}: ${warning.file} :: ${warning.fullName || warning.title} took ` +
  `${Math.round(warning.duration)}ms (calibrated ${warning.calibratedMs}ms)`);

export async function runWithSoftTimeouts({ args, reportPath, runAndRead }) {
  const { args: cappedArgs, calibratedDefaultMs } = applyHangCap(args);
  const first = await runAndRead(cappedArgs, reportPath);
  const warnings = findCalibrationWarnings(first.report, calibratedDefaultMs);
  reportSoftTimeouts(warningLines(warnings, 'Slower than calibrated'));
  const targets = first.exitCode === 0 ? warnings : planRerun(first.report, warnings);
  if (!targets.length) return first;
  console.log(`[vitest-summary] rerunning ${targets.length} test(s) once on their own`);
  const second = await runAndRead(rerunArgs(cappedArgs, targets), reportPath.replace(/\.json$/u, '.rerun.json'));
  const repeated = findCalibrationWarnings(second.report, calibratedDefaultMs);
  const lines = warningLines(repeated, 'Slower than calibrated twice; review locally on the same platform');
  if (first.exitCode !== 0) {
    lines.push(second.exitCode === 0
      ? '::warning::Timed-out tests passed only on their single rerun'
      : '::error::Tests failed twice; reproduce locally on the same platform');
  } else if (second.exitCode !== 0) {
    lines.push('::warning::A slow test failed on its single rerun; review locally on the same platform');
  }
  reportSoftTimeouts(lines);
  return { ...first, exitCode: first.exitCode === 0 ? 0 : second.exitCode };
}
