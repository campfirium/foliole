const STAGE_FILE = 'files/foliole-pair-sync-stage.txt';
const TEST_APP_ID = 'com.foliole.android.test';

export async function collectPairSyncHostStage({
  adbPort, buildIdentity, env, execute, paths, serial
}) {
  try {
    const result = await execute(paths.adbPath, [
      '-P', adbPort, '-s', serial, 'shell', 'run-as', TEST_APP_ID, 'cat', STAGE_FILE
    ], { env, timeoutCode: 'pair_sync_stage_timeout', timeoutMs: 10_000, windowsHide: true });
    if (result.code !== 0) return null;
    const [observedRunId, stage] = String(result.stdout).trim().split(/\r?\n/u);
    if (observedRunId !== buildIdentity || !/^[a-z][a-z-]{0,63}$/u.test(stage)) return null;
    return stage;
  } catch { return null; }
}
