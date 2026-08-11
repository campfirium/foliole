// @vitest-environment node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { runWindowsDevBuild } from './windows-dev-build.mjs';
import { allowsPairSyncNativeClient } from './windows-dev-residual-process.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-pair-build-'));
  roots.push(root);
  const repoRoot = path.join(root, 'repo');
  const signingHome = path.join(root, 'signing');
  const signingKeystore = path.join(signingHome, 'debug.keystore');
  const paths = {
    adbPath: path.join(root, 'adb.exe'), androidSdk: path.join(root, 'sdk'),
    javaHome: path.join(root, 'java'), repoRoot, signingHome, signingKeystore,
    signingManifest: path.join(signingHome, 'identity.json'), systemNode: path.join(root, 'node.exe'),
    systemNpmCli: path.join(root, 'npm-cli.js')
  };
  for (const directory of [repoRoot, signingHome, paths.androidSdk, paths.javaHome]) fs.mkdirSync(directory, { recursive: true });
  for (const file of [paths.adbPath, paths.systemNode, paths.systemNpmCli]) fs.writeFileSync(file, 'tool');
  fs.writeFileSync(signingKeystore, 'keystore');
  fs.writeFileSync(paths.signingManifest, JSON.stringify({
    keystorePath: fs.realpathSync.native(signingKeystore), schemaVersion: 1,
    sha256: createHash('sha256').update('keystore').digest('hex')
  }));
  return paths;
}

it('gates pair recovery before its fixed desktop and Android build path', async () => {
  const paths = fixture();
  const calls = [];
  const execute = vi.fn(async (command, args, options) => {
    calls.push({ args, command, options });
    if (command === 'powershell.exe') {
      const nativeCommand = `"${paths.systemNode}" "${path.join(
        paths.repoRoot, 'scripts', 'windows', 'electron-dev-native.mjs'
      )}"`.replaceAll('/', '\\');
      const commandLine = `"C:\\Windows\\system32\\cmd.exe" /d /c "${nativeCommand}"`;
      const output = `${JSON.stringify([{ CommandLine: commandLine, Name: 'cmd.exe' }])}\n`;
      return { code: 0, output, stdout: output };
    }
    if (command === 'cmd.exe') {
      options.onSpawn?.({ pid: 7 });
      return { code: 0, lines: ['BUILD SUCCESSFUL'], output: 'BUILD SUCCESSFUL\n', stdout: 'BUILD SUCCESSFUL\n' };
    }
    return { code: 0, output: '', stdout: '' };
  });
  const readiness = { deviceIdentityFingerprint: '0123456789abcdef', resultStatus: 'ready', schemaVersion: 1 };
  const deviceAction = vi.fn(async ({ buildIdentity, phase }) => phase === 'readiness'
    ? { output: 'ready\n', pairSyncRecoveryReadiness: readiness }
    : { output: 'recovered\n', pairSyncRecovery: { buildIdentity, manifestPath: 'manifest.json' } });
  const prepareHost = vi.fn(async () => 'prepared\n');
  const run = await runWindowsDevBuild({
    action: 'pairsyncrecover', deviceAction, execute, paths, platform: 'win32', prepareHost
  });
  expect(run).toMatchObject({ exitCode: 0, summary: { action: 'pair-sync-recover' } });
  expect(deviceAction.mock.calls.map(([value]) => value.phase)).toEqual(['readiness', 'execute']);
  expect(deviceAction.mock.calls[1][0].pairSyncRecoveryReadiness).toBe(readiness);
  expect(prepareHost).toHaveBeenCalledWith(expect.objectContaining({ liveReload: false }));
  expect(calls.filter(({ command }) => command === paths.systemNode).map(({ args }) => args.at(-1)))
    .toEqual(expect.arrayContaining(['build', 'electron:compile']));
  expect(calls.find(({ command }) => command === 'cmd.exe').args.at(-1)).toContain('assembleDebug assembleDebugAndroidTest');
});

it('keeps fixed screenshot and Windows request evidence on a failed pair recovery summary', async () => {
  const paths = fixture();
  const execute = vi.fn(async (command, args, options) => {
    if (command === 'powershell.exe') {
      const nativeCommand = `"${paths.systemNode}" "${path.join(
        paths.repoRoot, 'scripts', 'windows', 'electron-dev-native.mjs'
      )}"`.replaceAll('/', '\\');
      const output = `${JSON.stringify([{
        CommandLine: `"C:\\Windows\\system32\\cmd.exe" /d /c "${nativeCommand}"`, Name: 'cmd.exe'
      }])}\n`;
      return { code: 0, output, stdout: output };
    }
    if (command === 'cmd.exe') {
      options.onSpawn?.({ pid: 7 });
      return { code: 0, lines: ['BUILD SUCCESSFUL'], output: 'BUILD SUCCESSFUL\n', stdout: 'BUILD SUCCESSFUL\n' };
    }
    return { code: 0, output: '', stdout: '' };
  });
  const readiness = { deviceIdentityFingerprint: '0123456789abcdef', resultStatus: 'ready', schemaVersion: 1 };
  const deviceAction = vi.fn(async ({ phase }) => {
    if (phase === 'readiness') return { output: '', pairSyncRecoveryReadiness: readiness };
    throw Object.assign(new Error('pairing failed'), {
      exitCode: 74,
      pairSyncFailureEvidence: {
        desktopOverview: 'pair-sync-recovery-failure-desktop-overview.json',
        ignored: 'C:\\private\\raw.log',
        screenshot: 'pair-sync-recovery-failure.png'
      },
      pairSyncRecoveryEvidence: {
        android: {
          completion: 'http_200', credentials: 'saved_not_signable', initialSync: 'not_started'
        },
        approval: { approve_invoked: true, approve_succeeded: true, pending_observed: true },
        secret: 'must-be-dropped'
      },
      stage: 'pair-sync-instrumentation'
    });
  });
  const run = await runWindowsDevBuild({
    action: 'pairsyncrecover', deviceAction, execute, paths, platform: 'win32',
    prepareHost: vi.fn(async () => '')
  });
  expect(run).toMatchObject({
    exitCode: 74,
    summary: {
      pairSyncFailureEvidence: {
        desktopOverview: 'pair-sync-recovery-failure-desktop-overview.json',
        screenshot: 'pair-sync-recovery-failure.png'
      },
      pairSyncRecoveryEvidence: {
        android: {
          completion: 'http_200', credentials: 'saved_not_signable', initialSync: 'not_started'
        },
        approval: { approve_invoked: true, approve_succeeded: true, pending_observed: true }
      }
    }
  });
  expect(run.summary.pairSyncFailureEvidence).not.toHaveProperty('ignored');
  expect(run.summary.pairSyncRecoveryEvidence).not.toHaveProperty('secret');
});

it('rejects unknown or additional residual processes for pair recovery', () => {
  const paths = fixture();
  const script = path.join(paths.repoRoot, 'scripts', 'windows', 'electron-dev-native.mjs');
  const nativeCommand = `"${paths.systemNode}" "${script}"`.replaceAll('/', '\\');
  const trusted = {
    CommandLine: `"C:\\Windows\\system32\\cmd.exe" /d /c "${nativeCommand}"`,
    Name: 'cmd.exe'
  };
  expect(allowsPairSyncNativeClient('pair-sync-recover', [trusted], paths)).toBe(true);
  expect(allowsPairSyncNativeClient('multi-device-sync-candidate', [trusted], paths)).toBe(false);
  expect(allowsPairSyncNativeClient('pair-sync-recover', [{ ...trusted, CommandLine: 'cmd.exe /c unknown' }], paths)).toBe(false);
  expect(allowsPairSyncNativeClient('pair-sync-recover', [trusted, { Name: 'java.exe' }], paths)).toBe(false);
  expect(allowsPairSyncNativeClient('capture-annotation', [trusted], paths)).toBe(false);
});
