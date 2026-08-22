// @vitest-environment node
/* global process */

import fs from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';

import {
  acquireMacosHiddenCredentialSessionLock,
  resolveMacosHiddenCredentialSession
} from './macos-hidden-electron-credential-session.mjs';

const fingerprint = 'b'.repeat(64);
const repoRoot = path.join(path.parse(process.cwd()).root, 'repo', 'foliole');

it('binds the app name and pairing store to an isolated source runtime session', () => {
  const session = resolveMacosHiddenCredentialSession(repoRoot, fingerprint);

  expect(session.appName).toBe(`Foliole Hidden Native ${'b'.repeat(20)}`);
  expect(session.bootstrapPath).toBe(
    path.join(repoRoot, 'scripts', 'desktop', 'macos-hidden-electron-credential-bootstrap.mjs')
  );
  expect(session.pairingStorePath).toBe(
    path.join(repoRoot, '.tmp', 'native-hidden-electron', 'credential-sessions',
      `runtime-${'b'.repeat(20)}`, 'user-data', 'companion-paired-devices.bin')
  );
  expect(session.pairingStorePath).not.toBe(
    path.join(repoRoot, '.tmp/macos-desktop-daily-debug/user-data/companion-paired-devices.bin')
  );
  expect(() => resolveMacosHiddenCredentialSession(repoRoot, 'not-a-fingerprint'))
    .toThrow('macos_hidden_electron_runtime_fingerprint_invalid');
});

it('keeps session state outside an ephemeral build source', () => {
  const stateRoot = path.join(path.parse(process.cwd()).root, 'controller', 'runtime');
  const session = resolveMacosHiddenCredentialSession(repoRoot, fingerprint, stateRoot);
  expect(session.bootstrapPath.startsWith(repoRoot)).toBe(true);
  expect(session.pairingStorePath).toBe(path.join(stateRoot, 'credential-sessions',
    `runtime-${'b'.repeat(20)}`, 'user-data', 'companion-paired-devices.bin'));
});

it('overrides the product app name after main setup but before Electron becomes ready', () => {
  const source = fs.readFileSync(
    'scripts/desktop/macos-hidden-electron-credential-bootstrap.mjs', 'utf8'
  );
  const importIndex = source.indexOf('await import(');
  const focusGuardIndex = source.indexOf('installMacosHiddenElectronFocusGuard(');
  const readyGuardIndex = source.indexOf('app.isReady()');
  const setNameIndex = source.indexOf('app.setName(appName)');

  expect(importIndex).toBeGreaterThan(-1);
  expect(focusGuardIndex).toBeGreaterThan(-1);
  expect(focusGuardIndex).toBeLessThan(importIndex);
  expect(readyGuardIndex).toBeGreaterThan(importIndex);
  expect(setNameIndex).toBeGreaterThan(readyGuardIndex);
  expect(source).not.toContain('safeStorage');
});

function memoryFileSystem(initialLock = null) {
  let lock = initialLock;
  return {
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => lock),
    unlinkSync: vi.fn(() => { lock = null; }),
    writeFileSync: vi.fn((_target, value, options) => {
      if (options?.flag !== 'wx') throw new Error('exclusive lock required');
      if (lock !== null) throw Object.assign(new Error('exists'), { code: 'EEXIST' });
      lock = value;
    })
  };
}

it('serializes a credential session and releases only its own lock', () => {
  const session = resolveMacosHiddenCredentialSession(repoRoot, fingerprint);
  const fileSystem = memoryFileSystem();
  const release = acquireMacosHiddenCredentialSessionLock(session, {
    fileSystem, pid: 41, signalProcess: vi.fn()
  });

  expect(() => acquireMacosHiddenCredentialSessionLock(session, {
    fileSystem, pid: 42, signalProcess: vi.fn()
  })).toThrow('macos_hidden_electron_credential_session_busy');
  release();
  expect(fileSystem.unlinkSync).toHaveBeenCalledWith(session.lockPath);
});

it('reclaims a credential session lock only after its owner has exited', () => {
  const session = resolveMacosHiddenCredentialSession(repoRoot, fingerprint);
  const fileSystem = memoryFileSystem(`${JSON.stringify({ pid: 40 })}\n`);
  const signalProcess = vi.fn(() => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); });

  const release = acquireMacosHiddenCredentialSessionLock(session, {
    fileSystem, pid: 41, signalProcess
  });
  expect(signalProcess).toHaveBeenCalledWith(40, 0);
  release();
});
