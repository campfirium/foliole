const STAGE_FILE = 'files/foliole-pair-sync-stage.txt';
const TEST_APP_ID = 'com.foliole.android.test';

export async function collectPairSyncHostStage({
  adbPort, buildIdentity, env, execute, paths, serial
}) {
  const options = { env, timeoutCode: 'pair_sync_stage_timeout', timeoutMs: 10_000,
    windowsHide: true };
  try {
    const result = await execute(paths.adbPath, [
      '-P', adbPort, '-s', serial, 'shell', 'run-as', TEST_APP_ID, 'cat', STAGE_FILE
    ], options);
    const [observedRunId, stage] = String(result.stdout).trim().split(/\r?\n/u);
    if (result.code === 0 && observedRunId === buildIdentity
        && typeof stage === 'string' && /^[a-z][a-z-]{0,63}$/u.test(stage)) return stage;
  } catch { /* Fall through to the current-run log marker. */ }
  try {
    const result = await execute(paths.adbPath, [
      '-P', adbPort, '-s', serial, 'logcat', '-d', '-s', 'FoliolePairSync:I', '*:S'
    ], options);
    const marker = `${buildIdentity}:`;
    const line = String(result.stdout).split(/\r?\n/u).filter((item) => item.includes(marker)).at(-1);
    const stage = line?.slice(line.lastIndexOf(marker) + marker.length).trim();
    return result.code === 0 && typeof stage === 'string'
      && /^[a-z][a-z-]{0,63}$/u.test(stage) ? stage : null;
  } catch { return null; }
}
