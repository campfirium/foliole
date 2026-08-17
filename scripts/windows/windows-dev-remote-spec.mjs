import os from 'node:os';
import path from 'node:path';

import { toWindowsDevWireAction } from './windows-dev-action-contract.mjs';
import { WINDOWS_DEV_REPO_ROOT_POSIX } from './windows-dev-paths.mjs';

/* global process */

const REMOTE_ACTION =
  `${WINDOWS_DEV_REPO_ROOT_POSIX}/scripts/windows/windows-dev-action.ps1`;

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
