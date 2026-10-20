/* global console */

import { runWindowsDevControl } from '../windows/windows-dev-control.mjs';
import { assertPushedPreflightTarget } from '../windows/windows-remote-preflight-control.mjs';
import { MAX_PREFLIGHT_TESTS, planPreflightSelection } from './remote-quality-preflight-plan.mjs';
import { preflightFailureMessage, resolvePreflightBase } from './remote-quality-preflight.mjs';

function formatFailedFiles(failure) {
  return (failure?.failedFiles ?? []).map(({ file, message }) => (
    `  ${file}${message ? `: ${message.split('\n')[0]}` : ''}`
  ));
}

// A Windows receipt stands in for the local preflight only when it ran this
// exact target from the same base and cap and covered every selected test.
export function verifyWindowsPreflightReceipt({ base, cap, expected, receipt, target }) {
  if (receipt?.target?.revision !== target) {
    throw new Error(`Windows preflight ran ${receipt?.target?.revision ?? 'no revision'}, `
      + `not the dispatch target ${target}`);
  }
  if (receipt.base !== base) {
    throw new Error(`Windows preflight base ${receipt.base} differs from ${base}`);
  }
  if (receipt.resultStatus === 'error') {
    throw new Error(`Windows preflight could not run (${receipt.failure?.stage}): ${receipt.failure?.message}`);
  }
  if (receipt.cap !== cap) throw new Error(`Windows preflight cap ${receipt.cap} differs from ${cap}`);
  const selected = new Set(receipt.selected ?? []);
  const missing = expected.filter((file) => !selected.has(file));
  if (missing.length > 0) {
    throw new Error(`Windows preflight does not cover ${missing.length} selected test file(s): `
      + `${missing.slice(0, 10).join(', ')}`);
  }
  if (receipt.resultStatus !== 'passed') {
    throw new Error([preflightFailureMessage(expected), 'Windows failures:',
      ...formatFailedFiles(receipt.failure)].join('\n'));
  }
  return receipt;
}

export async function runWindowsRemoteQualityPreflight(options) {
  const { cwd, head, log = console.log, runner } = options;
  const control = options.control ?? ((argv) => runWindowsDevControl({ argv, repoRoot: cwd }));
  (options.verifyPushed ?? assertPushedPreflightTarget)(cwd, head);
  const base = options.base ?? await resolvePreflightBase({ ...options, cwd, runner });
  const cap = options.cap ?? MAX_PREFLIGHT_TESTS;
  const plan = await (options.plan ?? planPreflightSelection)({
    base, cap, cwd, head, revision: true, runner
  });
  const expected = plan.run.map(({ file }) => file);
  log(`[remote-preflight] ${plan.changedFiles.length} changed file(s) since ${base.slice(0, 12)}; `
    + `${plan.entries.length} related test file(s); running ${expected.length} on Windows`);
  if (expected.length === 0) return { base, deferred: plan.deferred, host: 'windows', run: plan.run };
  const startedAt = Date.now();
  const result = await control(['remote-preflight', '--revision', head, '--preflight-base', base]);
  verifyWindowsPreflightReceipt({ base, cap, expected, receipt: result.receipt, target: head });
  log(`[remote-preflight] Windows assertions pass for ${head.slice(0, 12)} in `
    + `${Math.round((Date.now() - startedAt) / 1000)}s (tests ${Math.round(
      (result.receipt.testDurationMs ?? 0) / 1000)}s); receipt ${result.receiptPath}`);
  return { base, deferred: plan.deferred, host: 'windows', receiptPath: result.receiptPath,
    run: plan.run };
}
