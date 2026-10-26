import fs from 'node:fs';
import path from 'node:path';

const ACCEPTANCE_APP = 'com.campfirium.foliole.android.acceptance';

export async function saveA5InstrumentationFailure({
  appId, error, evidenceRoot, execute, options, paths, serial
}) {
  if (appId !== ACCEPTANCE_APP) return;
  const root = path.join(evidenceRoot, 'instrumentation-failure');
  fs.mkdirSync(root, { recursive: true });
  const failures = [];
  const run = async (args) => {
    const result = await execute(paths.adb, ['-s', serial, ...args],
      { ...options, timeoutMs: 15_000 });
    if (result.code !== 0) throw new Error(result.stderr || result.output || 'Capture failed');
    return String(result.stdout ?? result.output ?? '');
  };
  const attempt = async (name, capture) => {
    try { await capture(); }
    catch (failure) { failures.push({ name, error: String(failure) }); }
  };
  fs.writeFileSync(path.join(root, 'failure.txt'),
    `${error.stack ?? error}\n${error.result?.output ?? error.result?.stdout ?? ''}\n`);
  const stdout = error.result?.stdout ?? error.result?.output ?? '';
  const failurePid = stdout.match(/^INSTRUMENTATION_STATUS: folioleFailurePid=(\d+)$/mu)?.[1];
  await attempt('logcat', async () => {
    const crash = await run(['logcat', '-b', 'crash', '-d', '-v', 'threadtime', '-t', '500']);
    const log = crash + '\n' + await run(['logcat', '-d', '-v', 'threadtime',
      ...(failurePid ? [`--pid=${failurePid}`] : []), '-t', '2000']);
    const pids = new Set([...log.matchAll(
      /Start proc (\d+):com\.campfirium\.foliole\.android\.acceptance\//gu
    )].map((match) => match[1]));
    for (const match of crash.matchAll(
      /Process: com\.campfirium\.foliole\.android\.acceptance, PID: (\d+)/gu
    )) pids.add(match[1]);
    if (failurePid) pids.add(failurePid);
    else await attempt('pid', async () => {
      const pid = await run(['shell', 'pidof', appId]);
      for (const value of pid.trim().split(/\s+/u)) if (/^\d+$/u.test(value)) pids.add(value);
    });
    const rows = log.split('\n').filter((line) => {
      const pid = line.match(/^\d\d-\d\d\s+\S+\s+(\d+)\s/u)?.[1];
      return pids.has(pid) || line.includes(ACCEPTANCE_APP);
    });
    fs.writeFileSync(path.join(root, 'logcat-tail.txt'), `${rows.join('\n')}\n`);
    fs.writeFileSync(path.join(root, 'console.txt'),
      `${rows.filter((line) => /Capacitor\/Console|chromium/iu.test(line)).join('\n')}\n`);
  });
  await attempt('screenshot', () => saveScreenshot({ appId, root, run, stdout }));
  fs.writeFileSync(path.join(root, 'capture-errors.json'), `${JSON.stringify(failures, null, 2)}\n`);
}

async function saveScreenshot({ appId, root, run, stdout }) {
  if (/^INSTRUMENTATION_STATUS: folioleFailureScreenshot=saved$/mu.test(stdout)) {
    await run(['pull', `/sdcard/Android/data/${appId}/files/join-failure.png`,
      path.join(root, 'screen.png')]);
    return;
  }
  const activity = await run(['shell', 'dumpsys', 'activity', 'activities']);
  if (!activity.split('\n').some((line) =>
    /mResumedActivity|topResumedActivity/u.test(line) && line.includes(`${appId}/`))) {
    throw new Error('Acceptance app is not foreground; screenshot omitted.');
  }
  const remote = '/sdcard/Download/foliole-a5-instrumentation-failure.png';
  try {
    await run(['shell', 'screencap', '-p', remote]);
    await run(['pull', remote, path.join(root, 'screen.png')]);
  } finally { await run(['shell', 'rm', '-f', remote]); }
}
