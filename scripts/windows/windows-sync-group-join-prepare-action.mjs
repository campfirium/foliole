/* global process */

import path from 'node:path';

const ACTION = 'sync-group-join-prepare';
const ACCEPTANCE_SPEC = 'tests/desktop/sync-group-join-prepare.spec.ts';
const TIMEOUT_MS = 20 * 60_000;

export async function runWindowsSyncGroupJoinPrepareAcceptance(
  action, execute, paths, evidenceRoot
) {
  if (action !== ACTION) return null;
  const result = await execute(paths.systemNode, [
    paths.systemNpmCli, 'run', 'test:e2e:desktop:native:hidden', '--', ACCEPTANCE_SPEC
  ], { cwd: paths.repoRoot, env: { ...process.env,
    FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD: '1',
    FOLIOLE_SYNC_GROUP_JOIN_PREPARE_EVIDENCE_ROOT: evidenceRoot
  }, timeoutCode: 'desktop_sync_group_join_prepare_timeout',
  timeoutMs: TIMEOUT_MS, windowsHide: true });
  if (result.code !== 0) {
    const detail = result.lines?.at(-1) || result.stderr
      || 'Windows Sync Group join prepare acceptance failed';
    throw Object.assign(new Error(String(detail).trim()), {
      exitCode: 74, result, stage: 'desktop-sync-group-join-prepare'
    });
  }
  return { evidence: {
    receiptPath: path.join(evidenceRoot, 'sync-group-join-prepare-receipt.json'),
    resultStatus: 'passed', screenshotPath: path.join(evidenceRoot, 'sync-group-join-prepare.png'),
    spec: ACCEPTANCE_SPEC
  }, output: result.output };
}
