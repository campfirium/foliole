import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { toWindowsDevWireAction } from './windows-dev-action-contract.mjs';
import { WINDOWS_DEV_REPO_ROOT_POSIX } from './windows-dev-paths.mjs';

/* global process */

const REMOTE_ACTION =
  `${WINDOWS_DEV_REPO_ROOT_POSIX}/scripts/windows/windows-dev-action.ps1`;
export const WINDOWS_DEV_DEFAULT_SSH = 'zephu@192.168.0.11';
const SSH_OPTIONS = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
  '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes'];

function digest(value) { return createHash('sha256').update(value).digest('hex'); }

export function windowsDevTransportIdentity({ env = process.env, fsApi = fs,
  home = os.homedir(), host } = {}) {
  const resolvedHost = (host ?? env.FOLIOLE_WINDOWS_DEV_SSH ?? WINDOWS_DEV_DEFAULT_SSH).trim();
  const identityInput = (env.FOLIOLE_WINDOWS_DEV_SSH_KEY
    || path.join(home, '.ssh', 'agent', 'foliole-windows-android-lab')).trim();
  if (!/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/u.test(resolvedHost)) {
    throw new Error('Windows SSH host must use user@host format');
  }
  if (!path.isAbsolute(identityInput)) throw new Error('Windows SSH identity must be absolute');
  const inputFacts = fsApi.lstatSync(identityInput);
  if (!inputFacts.isFile() || inputFacts.isSymbolicLink()) {
    throw new Error('Windows SSH identity must be an ordinary file');
  }
  const identityPath = fsApi.realpathSync(identityInput);
  const facts = fsApi.lstatSync(identityPath);
  if (!facts.isFile() || facts.isSymbolicLink()) {
    throw new Error('Windows SSH identity must be an ordinary file');
  }
  const mode = facts.mode & 0o777;
  if ((mode & 0o077) !== 0) throw new Error('Windows SSH identity permissions are too broad');
  const bytes = fsApi.readFileSync(identityPath);
  const receipt = { host: resolvedHost, identity: { mode, path: identityPath,
    sha256: digest(bytes), size: facts.size }, optionsSha256: digest(JSON.stringify(SSH_OPTIONS)),
  schemaVersion: 1 };
  return { host: resolvedHost, identityPath, options: ['-i', identityPath, ...SSH_OPTIONS], receipt };
}

export function windowsDevSshSpec(host, action, env = process.env, home = os.homedir()) {
  const transport = windowsDevTransportIdentity({ env, home, host });
  const expectedGroupId = env.FOLIOLE_T152_EXPECTED_GROUP_ID?.trim();
  const expectedGroupTag = env.FOLIOLE_T152_EXPECTED_GROUP_TAG?.trim();
  if (expectedGroupId && !/^group-[0-9a-f-]{36}$/u.test(expectedGroupId)) {
    throw new Error('T152 expected Sync Group id is invalid.');
  }
  if (expectedGroupId && !/^[0-9a-f]{32}$/u.test(expectedGroupTag ?? '')) {
    throw new Error('T152 expected Sync Group tag is invalid.');
  }
  return ['-T', ...transport.options, transport.host,
    'powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', REMOTE_ACTION, toWindowsDevWireAction(action),
    ...(expectedGroupId ? ['-ExpectedGroupId', expectedGroupId,
      '-ExpectedGroupTag', expectedGroupTag] : [])];
}

export function windowsDevScpSpec(host, remotePath, localPath,
  env = process.env, home = os.homedir()) {
  const transport = windowsDevTransportIdentity({ env, home, host });
  return ['-q', ...transport.options, `${transport.host}:${remotePath}`, localPath];
}
