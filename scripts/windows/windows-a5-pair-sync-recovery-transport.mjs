export const PAIR_SYNC_PORT = '38641';

export function assertPairSyncRuntimeOwnership(overview, session) {
  if (overview?.sync_enabled !== true || overview?.server_status?.state !== 'running'
      || String(overview.server_status.port) !== PAIR_SYNC_PORT) {
    throw new Error('Windows current session did not acquire the fixed sync listener.');
  }
  session.assertActive();
}

export async function openPairSyncRecoveryTransport(runAdb) {
  await runAdb(['reverse', `tcp:${PAIR_SYNC_PORT}`, `tcp:${PAIR_SYNC_PORT}`], 'pair-sync-transport-open');
}

export async function closePairSyncRecoveryTransport(runAdb) {
  await runAdb(['reverse', '--remove', `tcp:${PAIR_SYNC_PORT}`], 'pair-sync-transport-close');
}

export async function cleanupPairSyncRecoveryTestPackage(runAdb, testAppId) {
  const result = await runAdb(['uninstall', testAppId], 'pair-sync-cleanup');
  if (!/^Success\s*$/mu.test(result.stdout)) {
    throw Object.assign(new Error('Test APK cleanup did not report Success'), {
      exitCode: 74, result, stage: 'pair-sync-cleanup'
    });
  }
  return result.output;
}
