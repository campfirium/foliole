import fs from 'node:fs';
import path from 'node:path';

function captureJoinFailure(args, evidencePath) {
  const localPath = path.join(path.dirname(evidencePath), 'join-failure-screen.png');
  const remotePath = '/sdcard/Download/foliole-a5-join-failure-screen.png';
  try {
    args.checked(args.paths.adb, [
      '-s', args.serial, 'shell', 'screencap', '-p', remotePath
    ]);
    args.checked(args.paths.adb, ['-s', args.serial, 'pull', remotePath, localPath]);
  } catch (error) {
    fs.writeFileSync(`${localPath}.error.txt`, `${error instanceof Error ? error.message : error}\n`);
  } finally {
    try {
      args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'rm', '-f', remotePath]);
    } catch { /* Preserve the original join failure. */ }
  }
}

export function validateA5TwoDeviceJoin({ args, evidencePath, stdout }) {
  if (!/folioleSyncGroupJoinReceipt=.*"joined":true.*"restarted":true/u.test(stdout)
      || !/INSTRUMENTATION_CODE: -1/mu.test(stdout)) {
    captureJoinFailure(args, evidencePath);
    const productError = stdout.match(
      /java\.lang\.(?:IllegalStateException|AssertionError): ([^\r\n]+)/u
    )?.[1];
    throw Object.assign(new Error('A5 Device join and restart evidence is incomplete.'), {
      evidenceRef: evidencePath, missingFact: 'a5_device_join_persistence', productError
    });
  }
}
