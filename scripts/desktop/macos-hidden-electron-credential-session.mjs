/* global process */

import fs from 'node:fs';
import path from 'node:path';

const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/u;
const SESSION_ROOT = '.tmp/native-hidden-electron/credential-sessions';

function readLockPid(lockPath, fileSystem) {
  try {
    const parsed = JSON.parse(fileSystem.readFileSync(lockPath, 'utf8'));
    return Number.isSafeInteger(parsed.pid) && parsed.pid > 0 ? parsed.pid : null;
  } catch {
    return null;
  }
}

function processIsAlive(pid, signalProcess) {
  try {
    signalProcess(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

export function resolveMacosHiddenCredentialSession(repoRoot, runtimeFingerprint, sessionStateRoot) {
  if (!FINGERPRINT_PATTERN.test(runtimeFingerprint)) {
    throw new Error('macos_hidden_electron_runtime_fingerprint_invalid');
  }
  const identity = runtimeFingerprint.slice(0, 20);
  const root = sessionStateRoot
    ? path.join(path.resolve(sessionStateRoot), 'credential-sessions', `runtime-${identity}`)
    : path.join(path.resolve(repoRoot), SESSION_ROOT, `runtime-${identity}`);
  return {
    appName: `Foliole Hidden Native ${identity}`,
    bootstrapPath: path.join(path.resolve(repoRoot),
      'scripts/desktop/macos-hidden-electron-credential-bootstrap.mjs'),
    lockPath: path.join(root, 'active.lock'),
    pairingStorePath: path.join(root, 'user-data', 'companion-paired-devices.bin'),
    root,
    userDataPath: path.join(root, 'user-data')
  };
}

export function acquireMacosHiddenCredentialSessionLock(session, {
  fileSystem = fs, pid = process.pid, signalProcess = process.kill
} = {}) {
  fileSystem.mkdirSync(session.root, { recursive: true });
  const claim = () => {
    fileSystem.writeFileSync(session.lockPath, `${JSON.stringify({ pid })}\n`, {
      encoding: 'utf8', flag: 'wx', mode: 0o600
    });
  };
  try {
    claim();
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const ownerPid = readLockPid(session.lockPath, fileSystem);
    if (!ownerPid || processIsAlive(ownerPid, signalProcess)) {
      throw new Error('macos_hidden_electron_credential_session_busy');
    }
    fileSystem.unlinkSync(session.lockPath);
    claim();
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const ownerPid = readLockPid(session.lockPath, fileSystem);
    if (ownerPid === pid) fileSystem.unlinkSync(session.lockPath);
  };
}
