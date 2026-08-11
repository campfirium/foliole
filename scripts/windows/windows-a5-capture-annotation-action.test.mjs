// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { runWindowsA5CaptureAnnotation } from './windows-a5-capture-annotation-action.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function instrumentationOutput(token) {
  const receipt = {
    captureCreated: true, clozeCreated: true, hydratedAfterRestart: true,
    noteCreated: true, ok: true, targetTestId: 'companion-capture-annotation-persistence', token
  };
  return [
    `INSTRUMENTATION_STATUS: folioleActionReceipt=${JSON.stringify(receipt)}`,
    'INSTRUMENTATION_STATUS: folioleAfterSemantic={"elements":[],"url":"capacitor://localhost"}',
    'INSTRUMENTATION_CODE: -1'
  ].join('\n');
}

function fixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-a5-capture-'));
  roots.push(repoRoot);
  const mainApk = path.join(repoRoot, 'android/app/build/outputs/apk/debug/app-debug.apk');
  const testApk = path.join(repoRoot, 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk');
  fs.mkdirSync(path.dirname(mainApk), { recursive: true });
  fs.mkdirSync(path.dirname(testApk), { recursive: true });
  fs.writeFileSync(mainApk, 'main-apk');
  fs.writeFileSync(testApk, 'test-apk');
  return {
    evidenceRoot: path.join(repoRoot, '.tmp/artifacts/windows-dev-action/capture-run-1'),
    paths: { adbPath: path.join(repoRoot, 'adb.exe'),
      protectionBackups: path.join(repoRoot, 'protection'), repoRoot }
  };
}

function packageDetails(packageName) {
  const isTestPackage = packageName.endsWith('.test');
  return [
    `Package [${packageName}] (abc):`, `  versionCode=${isTestPackage ? 2 : 1} minSdk=26`,
    `  versionName=${isTestPackage ? '1.0-test' : '1.0'}`,
    '  firstInstallTime=2026-07-31 10:00:00', '  lastUpdateTime=2026-07-31 11:00:00'
  ].join('\n');
}

function executor(token = 'capture-run-1') {
  const calls = [];
  const execute = vi.fn(async (command, args) => {
    calls.push({ args, command });
    let stdout = 'ok\n';
    if (args.includes('install') || args.includes('uninstall')) stdout = 'Success\n';
    if (args.includes('dumpsys')) stdout = packageDetails(args.at(-1));
    if (args.includes('path')) stdout = `package:/data/app/${args.at(-1)}/base.apk\n`;
    if (args.includes('instrumentation')) {
      stdout = 'instrumentation:com.foliole.android.test/androidx.test.runner.AndroidJUnitRunner (target=com.foliole.android)\n';
    }
    if (args.includes('log')) {
      stdout = 'INSTRUMENTATION_STATUS: test=persistsCaptureClozeAndNoteAfterRestart\n';
    } else if (args.includes('instrument')) stdout = instrumentationOutput(token);
    return { code: 0, lines: [], output: stdout, stderr: '', stdout };
  });
  return { calls, execute };
}

function auditSummary(token) {
  return {
    capture: { currentVersionId: 'v-capture', deviceId: 'a5', nodeId: 'capture', parentNodeId: 'special-inbox' },
    cloze: { currentVersionId: 'v-cloze', deviceId: 'a5', nodeId: 'cloze', parentNodeId: 'capture' },
    note: { currentVersionId: 'v-note', deviceId: 'a5', nodeId: 'note', parentNodeId: 'capture' },
    resultStatus: 'success', review: { due: '2026-07-31T12:00:00.000Z', state: 0 },
    schemaVersion: 1, token
  };
}

function protection() {
  return vi.fn(async (mode, manifest, backupRoot) => {
    if (mode === 'backup') {
      const targetRoot = backupRoot || path.join(path.dirname(manifest), 'protected');
      fs.mkdirSync(targetRoot, { recursive: true });
      const databasePath = path.join(targetRoot, 'snapshot.db');
      fs.writeFileSync(databasePath, 'sqlite');
      fs.writeFileSync(manifest, JSON.stringify({ backup: { created: true, databasePath } }));
    }
    return { output: `${mode}\n` };
  });
}

it('installs only same-run APKs, executes one fixed restart method, audits, and cleans up', async () => {
  const { evidenceRoot, paths } = fixture();
  const { calls, execute } = executor();
  const protectData = protection();
  const database = { close: vi.fn() };
  const result = await runWindowsA5CaptureAnnotation({
    adbPort: '5037', auditDatabase: vi.fn(() => auditSummary('capture-run-1')),
    buildIdentity: 'capture-run-1', env: {}, evidenceRoot, execute,
    openDatabase: vi.fn(() => database), paths, protectData, serial: '87a33a4b'
  });
  const adbArgs = calls.map(({ args }) => args);
  expect(adbArgs[0]).toEqual([
    '-P', '5037', '-s', '87a33a4b', 'shell', 'am', 'force-stop', 'com.foliole.android'
  ]);
  expect(adbArgs.filter((args) => args.includes('install'))).toEqual([
    ['-P', '5037', '-s', '87a33a4b', 'install', '-r', path.join(paths.repoRoot, 'android/app/build/outputs/apk/debug/app-debug.apk')],
    ['-P', '5037', '-s', '87a33a4b', 'install', '-r', '-t', path.join(paths.repoRoot, 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk')]
  ]);
  expect(adbArgs.find((args) => args.includes('instrument') && !args.includes('log'))).toContain(
    'com.foliole.android.FolioleCompanionWebViewAutomationTest#persistsCaptureClozeAndNoteAfterRestart'
  );
  expect(protectData.mock.calls.map(([mode]) => mode)).toEqual(['backup']);
  expect(adbArgs.at(-1)).toEqual(['-P', '5037', '-s', '87a33a4b', 'uninstall', 'com.foliole.android.test']);
  expect(database.close).toHaveBeenCalledOnce();
  const manifest = JSON.parse(fs.readFileSync(result.captureAnnotation.manifestPath, 'utf8'));
  expect(manifest).toMatchObject({
    action: 'capture-annotation', cleanup: {
      appForceStopped: true, auditSnapshotRemoved: true, testPackageRemoved: true
    },
    installedPackages: {
      main: { versionCode: '1', versionName: '1.0' },
      test: { versionCode: '2', versionName: '1.0-test' }
    },
    lifecycle: { liveServer: 'not-started', reverse: 'not-created' },
    nodes: { capture: { parentNodeId: 'special-inbox' } }, resultStatus: 'success',
    review: { state: 0 }, runId: 'capture-run-1', schemaVersion: 2, token: 'capture-run-1'
  });
  expect(manifest.builtApks.main.sha256).toMatch(/^[0-9a-f]{64}$/u);
  expect(fs.existsSync(path.join(evidenceRoot, 'capture-annotation-database'))).toBe(false);
});

it('rejects another run receipt, removes the installed test APK, and writes no success manifest', async () => {
  const { evidenceRoot, paths } = fixture();
  const { calls, execute } = executor('other-run');
  let failure;
  try {
    await runWindowsA5CaptureAnnotation({
      adbPort: '5037', buildIdentity: 'capture-run-1', env: {}, evidenceRoot, execute,
      paths, protectData: protection(), serial: '87a33a4b'
    });
  } catch (error) { failure = error; }
  expect(failure).toMatchObject({ stage: 'instrumentation-evidence' });
  expect(failure.result.output).toContain('folioleActionReceipt');
  expect(calls.some(({ args }) => args.includes('uninstall') && args.includes('com.foliole.android.test'))).toBe(true);
  expect(fs.existsSync(path.join(evidenceRoot, 'capture-annotation-manifest.json'))).toBe(false);
});

it('retains fixed instrumentation output when the read-only audit fails', async () => {
  const { evidenceRoot, paths } = fixture();
  const { execute } = executor();
  let failure;
  try {
    await runWindowsA5CaptureAnnotation({
      adbPort: '5037', auditDatabase: vi.fn(() => { throw new Error('Cloze Item was not found'); }),
      buildIdentity: 'capture-run-1', env: {}, evidenceRoot, execute,
      openDatabase: vi.fn(() => ({ close: vi.fn() })), paths,
      protectData: protection(), serial: '87a33a4b'
    });
  } catch (error) { failure = error; }
  expect(failure).toMatchObject({ stage: 'capture-database-audit' });
  expect(failure.result.output).toContain('folioleActionReceipt');
  expect(failure.result.output).toContain('Success');
});
