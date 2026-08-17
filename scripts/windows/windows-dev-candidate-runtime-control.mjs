import os from 'node:os';
import path from 'node:path';

import { WINDOWS_DEV_REPO_ROOT_POSIX } from './windows-dev-paths.mjs';

/* global process */

const REMOTE_NODE = 'C:/Progra~1/nodejs/node.exe';
const REMOTE_NATIVE_CLIENT =
  `${WINDOWS_DEV_REPO_ROOT_POSIX}/scripts/windows/windows-client-native.mjs`;

export function windowsDevNativeClientStopSpec(host, env = process.env, home = os.homedir()) {
  const key = env.FOLIOLE_WINDOWS_DEV_SSH_KEY
    || path.join(home, '.ssh', 'agent', 'foliole-windows-android-lab');
  return ['-T', '-i', key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
    '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', host,
    REMOTE_NODE, REMOTE_NATIVE_CLIENT, 'stop'];
}

export async function stopWindowsDevCandidateRuntime({ env, executeSsh, host, stdout }) {
  const output = await executeSsh(windowsDevNativeClientStopSpec(host, env), { env });
  if (output) stdout.write(output);
}
