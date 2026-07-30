// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import {
  CAPTURE_ANNOTATION_EVIDENCE_FILES, parseCaptureAnnotationInstrumentation,
  runWindowsA5CaptureAnnotation
} from './windows-a5-capture-annotation-action.mjs';

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
  return {
    evidenceRoot: path.join(repoRoot, '.tmp', 'artifacts', 'windows-dev-action', 'run-12345678'),
    paths: { adbPath: path.join(repoRoot, 'adb.exe'), repoRoot }, repoRoot
  };
}

function packageDetails(packageName) {
  return [
    `  Package [${packageName}] (abc123):`,
    '    versionCode=42 minSdk=26 targetSdk=35',
    '    versionName=0.4.2',
    '    firstInstallTime=2026-07-29 10:00:00',
    '    lastUpdateTime=2026-07-30 12:00:00'
  ].join('\n');
}

function auditSummary(token) {
  return {
    capture: { currentVersionId: 'v-capture', deviceId: 'device-a5', nodeId: 'capture', parentNodeId: 'special-inbox' },
    cloze: { currentVersionId: 'v-cloze', deviceId: 'device-a5', nodeId: 'cloze', reveal: 'Cloze target alpha' },
    note: { currentVersionId: 'v-note', deviceId: 'device-a5', nodeId: 'note' },
    resultStatus: 'success', schemaVersion: 1, token
  };
}

it('uses only installed packages, runs one fixed restart scenario, and writes bounded evidence', async () => {
  const { evidenceRoot, paths } = fixture();
  const calls = [];
  const execute = vi.fn(async (command, args) => {
    calls.push({ args, command });
    let stdout = 'Success\n';
    if (args.includes('dumpsys')) stdout = packageDetails(args.at(-1));
    if (args.includes('path')) stdout = `package:/data/app/${args.at(-1)}/base.apk\n`;
    if (args.includes('instrumentation')) {
      stdout = 'instrumentation:com.foliole.android.test/androidx.test.runner.AndroidJUnitRunner (target=com.foliole.android)\n';
    }
    if (args.includes('instrument')) stdout = instrumentationOutput('run-12345678');
    return { code: 0, lines: [], output: stdout, stderr: '', stdout };
  });
  const protectData = vi.fn(async (mode, manifest, backupRoot) => {
    if (mode === 'backup' && backupRoot) {
      fs.mkdirSync(backupRoot, { recursive: true });
      const databasePath = path.join(backupRoot, 'snapshot.db');
      fs.writeFileSync(databasePath, 'sqlite');
      fs.writeFileSync(manifest, JSON.stringify({ backup: { created: true, databasePath } }));
    }
  });
  const database = { close: vi.fn() };
  const result = await runWindowsA5CaptureAnnotation({
    adbPort: '5037', auditDatabase: vi.fn(() => auditSummary('run-12345678')),
    buildIdentity: 'run-12345678', env: {}, evidenceRoot, execute,
    openDatabase: vi.fn(() => database), paths, protectData, serial: '87a33a4b'
  });
  const adbArgs = calls.map(({ args }) => args);
  expect(adbArgs.filter((args) => args.includes('install'))).toHaveLength(0);
  expect(adbArgs.filter((args) => args.includes('dumpsys')).map((args) => args.at(-1)))
    .toEqual(['com.foliole.android', 'com.foliole.android.test']);
  expect(adbArgs.filter((args) => args.includes('path')).map((args) => args.at(-1)))
    .toEqual(['com.foliole.android', 'com.foliole.android.test']);
  expect(adbArgs.find((args) => args.includes('instrument'))).toEqual([
    '-P', '5037', '-s', '87a33a4b', 'shell', 'am', 'instrument', '-w', '-r',
    '-e', 'expectedValue', 'run-12345678', '-e', 'timeoutMs', '30000', '-e', 'class',
    'com.foliole.android.FolioleCompanionWebViewAutomationTest#persistsCaptureClozeAndNoteAfterRestart',
    'com.foliole.android.test/androidx.test.runner.AndroidJUnitRunner'
  ]);
  expect(protectData.mock.calls.map(([mode]) => mode)).toEqual(['backup']);
  for (const name of CAPTURE_ANNOTATION_EVIDENCE_FILES) {
    expect(fs.existsSync(path.join(evidenceRoot, name))).toBe(true);
  }
  expect(JSON.parse(fs.readFileSync(result.captureAnnotation.manifestPath, 'utf8'))).toMatchObject({
    action: 'capture-annotation', installedPackages: {
      main: { packageName: 'com.foliole.android', versionCode: '42', versionName: '0.4.2' },
      test: { packageName: 'com.foliole.android.test', versionCode: '42', versionName: '0.4.2' }
    }, nodes: { capture: { nodeId: 'capture' }, cloze: { nodeId: 'cloze' } },
    resultStatus: 'success', runId: 'run-12345678', token: 'run-12345678'
  });
  expect(database.close).toHaveBeenCalledOnce();
});

it('fails closed on a mismatched receipt token and still force-stops the app', async () => {
  const { evidenceRoot, paths } = fixture();
  const execute = vi.fn(async (_command, args) => {
    let stdout = 'Success\n';
    if (args.includes('dumpsys')) stdout = packageDetails(args.at(-1));
    if (args.includes('path')) stdout = `package:/data/app/${args.at(-1)}/base.apk\n`;
    if (args.includes('instrumentation')) {
      stdout = 'instrumentation:com.foliole.android.test/androidx.test.runner.AndroidJUnitRunner (target=com.foliole.android)\n';
    }
    if (args.includes('instrument')) stdout = instrumentationOutput('other-token');
    return { code: 0, lines: [], output: stdout, stderr: '', stdout };
  });
  await expect(runWindowsA5CaptureAnnotation({
    adbPort: '5037', buildIdentity: 'run-12345678', env: {}, evidenceRoot, execute,
    paths, protectData: vi.fn(), serial: '87a33a4b'
  })).rejects.toMatchObject({
    result: { stdout: expect.stringContaining('folioleActionReceipt') },
    stage: 'instrumentation-evidence'
  });
  expect(execute.mock.calls.some(([, args]) => args.includes('force-stop'))).toBe(true);
  expect(fs.existsSync(path.join(evidenceRoot, 'capture-annotation-manifest.json'))).toBe(false);
});

it('stops before instrumentation when the installed runner is unavailable', async () => {
  const { evidenceRoot, paths } = fixture();
  const execute = vi.fn(async (_command, args) => {
    let stdout = 'Success\n';
    if (args.includes('dumpsys')) stdout = packageDetails(args.at(-1));
    if (args.includes('path')) stdout = `package:/data/app/${args.at(-1)}/base.apk\n`;
    if (args.includes('instrumentation')) stdout = '';
    return { code: 0, lines: [], output: stdout, stderr: '', stdout };
  });
  await expect(runWindowsA5CaptureAnnotation({
    adbPort: '5037', buildIdentity: 'run-12345678', env: {}, evidenceRoot, execute,
    paths, protectData: vi.fn(), serial: '87a33a4b'
  })).rejects.toMatchObject({
    installedPackages: {
      main: { packageName: 'com.foliole.android', versionCode: '42' },
      test: { packageName: 'com.foliole.android.test', versionCode: '42' }
    },
    stage: 'installed-instrumentation'
  });
  expect(execute.mock.calls.some(([, args]) => args.includes('instrument'))).toBe(false);
  expect(execute.mock.calls.some(([, args]) => args.includes('force-stop'))).toBe(false);
});

it('rejects instrumentation that lacks the Android success code', () => {
  expect(() => parseCaptureAnnotationInstrumentation(
    instrumentationOutput('run-12345678').replace('INSTRUMENTATION_CODE: -1', 'INSTRUMENTATION_CODE: 0'),
    'run-12345678'
  )).toThrow('did not complete successfully');
});
