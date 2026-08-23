export const PAIR_SYNC_PORT = '38641';

export function pairSyncHostPort(env = {}) {
  const configured = String(env.FOLIOLE_COMPANION_SYNC_PORT ?? '');
  return /^[1-9]\d*$/u.test(configured) ? configured : PAIR_SYNC_PORT;
}

export function assertPairSyncRuntimeOwnership(overview, session, expectedPort = PAIR_SYNC_PORT) {
  if (overview?.sync_enabled !== true || overview?.server_status?.state !== 'running'
      || String(overview.server_status.port) !== String(expectedPort)) {
    throw new Error('Windows current session did not acquire the fixed sync listener.');
  }
  session.assertActive();
}

export async function openPairSyncRecoveryTransport(runAdb, {
  devicePort = PAIR_SYNC_PORT, hostPort = devicePort
} = {}) {
  await runAdb(['reverse', `tcp:${devicePort}`, `tcp:${hostPort}`], 'pair-sync-transport-open');
}

export async function closePairSyncRecoveryTransport(runAdb, { devicePort = PAIR_SYNC_PORT } = {}) {
  await runAdb(['reverse', '--remove', `tcp:${devicePort}`], 'pair-sync-transport-close');
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
