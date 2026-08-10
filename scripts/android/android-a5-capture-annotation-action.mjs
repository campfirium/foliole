import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { auditCaptureAnnotationDatabase } from './android-capture-annotation-audit.mjs';
import { openReadonlySqliteDatabaseSync } from './sqlite-readonly.mjs';
import {
  CAPTURE_ANNOTATION_APP_ID, CAPTURE_ANNOTATION_EVIDENCE_FILES,
  CAPTURE_ANNOTATION_RUNNER_IDENTITY, CAPTURE_ANNOTATION_TEST_APP_ID,
  CAPTURE_ANNOTATION_TEST_CLASS, CAPTURE_ANNOTATION_TEST_CLASS_NAME,
  CAPTURE_ANNOTATION_TEST_METHOD, CAPTURE_ANNOTATION_TEST_RUNNER,
  captureAnnotationArtifactPaths, captureAnnotationFailure,
  parseCaptureAnnotationInstrumentation, parseCaptureAnnotationPackage
} from './android-a5-capture-annotation-contract.mjs';

const MAIN_APK = 'android/app/build/outputs/apk/debug/app-debug.apk';
const TEST_APK = 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk';

async function checked(execute, command, args, options, stage) {
  let result;
  try { result = await execute(command, args, options); }
  catch (error) { throw captureAnnotationFailure(error.message, stage, error); }
  if (result.code === 0) return result;
  const detail = result.lines?.at(-1) || result.stderr || `${command} exited ${result.code}`;
  throw captureAnnotationFailure(String(detail).trim(), stage, result);
}

function commandOptions(env, timeoutCode, timeoutMs) {
  return { env, timeoutCode, timeoutMs, windowsHide: true };
}

function writeJson(fsApi, filePath, value) {
  fsApi.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function builtApkIdentity(fsApi, repoRoot, relativePath) {
  const filePath = path.join(repoRoot, ...relativePath.split('/'));
  if (!fsApi.existsSync(filePath)) {
    throw captureAnnotationFailure(`Built APK is missing: ${relativePath}`, 'built-apk');
  }
  return {
    filePath, relativePath,
    sha256: createHash('sha256').update(fsApi.readFileSync(filePath)).digest('hex'),
    size: fsApi.statSync(filePath).size
  };
}

async function installApk({ adbPort, env, execute, filePath, paths, serial, testOnly }) {
  const args = ['-P', adbPort, '-s', serial, 'install', '-r', ...(testOnly ? ['-t'] : []), filePath];
  const result = await checked(execute, paths.adbPath, args,
    commandOptions(env, 'capture_install_timeout', 5 * 60_000), testOnly ? 'test-apk-install' : 'main-apk-install');
  if (!/^Success\s*$/mu.test(result.stdout)) {
    throw captureAnnotationFailure('ADB install did not report Success', testOnly ? 'test-apk-install' : 'main-apk-install', result);
  }
  return result;
}

async function installedPackage({ adbPort, env, execute, packageName, paths, serial }) {
  const prefix = ['-P', adbPort, '-s', serial, 'shell'];
  const options = commandOptions(env, 'capture_package_query_timeout', 30_000);
  const details = await checked(execute, paths.adbPath,
    [...prefix, 'dumpsys', 'package', packageName], options, 'installed-package');
  const packagePaths = await checked(execute, paths.adbPath,
    [...prefix, 'pm', 'path', packageName], options, 'installed-package');
  return parseCaptureAnnotationPackage(packageName, details.stdout, packagePaths.stdout);
}

async function requireInstalledScenario(options) {
  const main = await installedPackage({ ...options, packageName: CAPTURE_ANNOTATION_APP_ID });
  const test = await installedPackage({ ...options, packageName: CAPTURE_ANNOTATION_TEST_APP_ID });
  const { adbPort, env, execute, paths, serial } = options;
  const command = ['-P', adbPort, '-s', serial, 'shell'];
  const runners = await checked(execute, paths.adbPath, [...command, 'pm', 'list', 'instrumentation'],
    commandOptions(env, 'capture_runner_query_timeout', 30_000), 'installed-instrumentation');
  const matches = String(runners.stdout).split(/\r?\n/u).map((line) => line.trim())
    .filter((line) => line === CAPTURE_ANNOTATION_RUNNER_IDENTITY);
  if (matches.length !== 1) {
    throw captureAnnotationFailure('Required capture annotation runner is not uniquely registered', 'installed-instrumentation');
  }
  const inventory = await checked(execute, paths.adbPath, [
    ...command, 'am', 'instrument', '-w', '-r', '-e', 'log', 'true',
    '-e', 'class', CAPTURE_ANNOTATION_TEST_CLASS_NAME, CAPTURE_ANNOTATION_TEST_RUNNER
  ], commandOptions(env, 'capture_test_inventory_timeout', 60_000), 'installed-test-inventory');
  const methods = String(inventory.stdout).split(/\r?\n/u)
    .filter((line) => line.startsWith('INSTRUMENTATION_STATUS: test='))
    .map((line) => line.slice('INSTRUMENTATION_STATUS: test='.length).trim()).filter(Boolean);
  if (!methods.includes(CAPTURE_ANNOTATION_TEST_METHOD)) {
    throw captureAnnotationFailure('Required capture annotation test method is unavailable', 'installed-test-inventory', inventory);
  }
  return { installedPackages: { main, test }, installedTestMethods: methods };
}

function auditSnapshot({ auditDatabase, fsApi, openDatabase, snapshotManifest, token }) {
  let snapshot;
  try { snapshot = JSON.parse(fsApi.readFileSync(snapshotManifest, 'utf8')); }
  catch { throw captureAnnotationFailure('Android database snapshot manifest is unreadable', 'capture-database-snapshot'); }
  if (!snapshot.backup?.created || !snapshot.backup.databasePath) {
    throw captureAnnotationFailure('Android database snapshot path is missing', 'capture-database-snapshot');
  }
  let database;
  try {
    database = openDatabase(snapshot.backup.databasePath);
    return auditDatabase(database, token);
  } catch (error) {
    throw captureAnnotationFailure(error.message, 'capture-database-audit', error);
  } finally { database?.close(); }
}

async function cleanupInstalledTest({ adbPort, env, execute, paths, serial }) {
  const forceStop = await checked(execute, paths.adbPath,
    ['-P', adbPort, '-s', serial, 'shell', 'am', 'force-stop', CAPTURE_ANNOTATION_APP_ID],
    commandOptions(env, 'capture_cleanup_timeout', 30_000), 'capture-cleanup');
  const uninstall = await checked(execute, paths.adbPath,
    ['-P', adbPort, '-s', serial, 'uninstall', CAPTURE_ANNOTATION_TEST_APP_ID],
    commandOptions(env, 'capture_cleanup_timeout', 60_000), 'capture-cleanup');
  if (!/^Success\s*$/mu.test(uninstall.stdout)) {
    throw captureAnnotationFailure('Test APK cleanup did not report Success', 'capture-cleanup', uninstall);
  }
  return { appForceStopped: true, output: `${forceStop.output}${uninstall.output}`, testPackageRemoved: true };
}

export async function runA5CaptureAnnotation({
  adbPort, auditDatabase = auditCaptureAnnotationDatabase, buildIdentity, env,
  evidenceRoot, execute, fsApi = fs, openDatabase = openReadonlySqliteDatabaseSync,
  paths, protectData, serial
}) {
  fsApi.mkdirSync(evidenceRoot, { recursive: true });
  const artifacts = captureAnnotationArtifactPaths(evidenceRoot);
  const snapshotManifest = path.join(evidenceRoot, 'capture-annotation-database-snapshot.json');
  const snapshotRoot = path.join(evidenceRoot, 'capture-annotation-database');
  const builtApks = {
    main: builtApkIdentity(fsApi, paths.repoRoot, MAIN_APK),
    test: builtApkIdentity(fsApi, paths.repoRoot, TEST_APK)
  };
  const output = [];
  let testInstalled = false;
  let primaryError = null;
  let proof;
  try {
    output.push((await checked(execute, paths.adbPath,
      ['-P', adbPort, '-s', serial, 'shell', 'am', 'force-stop', CAPTURE_ANNOTATION_APP_ID],
      commandOptions(env, 'capture_quiesce_timeout', 30_000), 'capture-quiesce')).output);
    output.push((await installApk({ adbPort, env, execute, filePath: builtApks.main.filePath,
      paths, serial, testOnly: false })).output);
    output.push((await installApk({ adbPort, env, execute, filePath: builtApks.test.filePath,
      paths, serial, testOnly: true })).output);
    testInstalled = true;
    const scenario = await requireInstalledScenario({ adbPort, env, execute, paths, serial });
    const instrumentation = await checked(execute, paths.adbPath, [
      '-P', adbPort, '-s', serial, 'shell', 'am', 'instrument', '-w', '-r',
      '-e', 'expectedValue', buildIdentity, '-e', 'timeoutMs', '30000',
      '-e', 'class', CAPTURE_ANNOTATION_TEST_CLASS, CAPTURE_ANNOTATION_TEST_RUNNER
    ], commandOptions(env, 'capture_instrumentation_timeout', 3 * 60_000), 'instrumentation');
    output.push(instrumentation.output);
    const evidence = parseCaptureAnnotationInstrumentation(instrumentation.stdout, buildIdentity);
    writeJson(fsApi, artifacts['capture-annotation-receipt.json'], evidence.receipt);
    writeJson(fsApi, artifacts['capture-annotation-semantic-snapshot.json'], evidence.semanticSnapshot);
    await checked(execute, paths.adbPath,
      ['-P', adbPort, '-s', serial, 'shell', 'am', 'force-stop', CAPTURE_ANNOTATION_APP_ID],
      commandOptions(env, 'capture_quiesce_timeout', 30_000), 'capture-quiesce');
    output.push((await protectData('backup', snapshotManifest, snapshotRoot)).output);
    const audit = auditSnapshot({ auditDatabase, fsApi, openDatabase, snapshotManifest, token: buildIdentity });
    writeJson(fsApi, artifacts['capture-annotation-db-summary.json'], audit);
    fsApi.rmSync(snapshotRoot, { force: true, recursive: true });
    fsApi.rmSync(snapshotManifest, { force: true });
    proof = { audit, evidence, scenario };
  } catch (error) { primaryError = error; }
  let cleanup = { appForceStopped: false, testPackageRemoved: false };
  if (testInstalled) {
    cleanup = {
      ...(await cleanupInstalledTest({ adbPort, env, execute, paths, serial })),
      auditSnapshotRemoved: true
    };
  }
  output.push(cleanup.output || '');
  if (primaryError) {
    if (!primaryError.result?.output) primaryError.result = { output: output.join('') };
    throw primaryError;
  }
  const manifest = {
    action: 'capture-annotation', artifacts: Object.fromEntries(
      CAPTURE_ANNOTATION_EVIDENCE_FILES.slice(1).map((name) => [name, name])
    ), builtApks: Object.fromEntries(Object.entries(builtApks).map(([name, value]) => [name, {
      relativePath: value.relativePath, sha256: value.sha256, size: value.size
    }])), cleanup, completedAt: new Date().toISOString(),
    installedPackages: proof.scenario.installedPackages,
    installedTestMethods: proof.scenario.installedTestMethods,
    lifecycle: { adbServer: 'fixed-adapter-owned', liveServer: 'not-started', reverse: 'not-created' },
    nodes: { capture: proof.audit.capture, cloze: proof.audit.cloze, note: proof.audit.note },
    resultStatus: 'success', review: proof.audit.review, runId: buildIdentity, schemaVersion: 2, serial,
    testClass: CAPTURE_ANNOTATION_TEST_CLASS, token: buildIdentity
  };
  writeJson(fsApi, artifacts['capture-annotation-manifest.json'], manifest);
  return {
    captureAnnotation: { buildIdentity, manifestPath: artifacts['capture-annotation-manifest.json'] },
    output: output.join('')
  };
}
