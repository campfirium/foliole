import os from 'node:os';
import path from 'node:path';

import { toWindowsDevWireAction } from './windows-dev-action-contract.mjs';

/* global process */

const REMOTE_ACTION =
  'C:/dev/foliole-android-lab-preview/scripts/windows/windows-dev-action.ps1';

function sshKey(env, home) {
  return env.FOLIOLE_WINDOWS_DEV_SSH_KEY
    || path.join(home, '.ssh', 'agent', 'foliole-windows-android-lab');
}

export function windowsDevSshSpec(host, action, env = process.env, home = os.homedir()) {
  return ['-T', '-i', sshKey(env, home), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
    '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', host,
    'powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', REMOTE_ACTION, toWindowsDevWireAction(action)];
}

export function windowsDevScpSpec(host, remotePath, localPath,
  env = process.env, home = os.homedir()) {
  return ['-q', '-i', sshKey(env, home), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
    '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes',
    `${host}:${remotePath}`, localPath];
}
