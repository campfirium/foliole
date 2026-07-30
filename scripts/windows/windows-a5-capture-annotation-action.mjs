import fs from 'node:fs';
import path from 'node:path';

import { auditCaptureAnnotationDatabase } from '../android/android-capture-annotation-audit.mjs';
import { openReadonlySqliteDatabaseSync } from '../android/sqlite-readonly.mjs';

export const CAPTURE_ANNOTATION_EVIDENCE_FILES = [
  'capture-annotation-manifest.json',
  'capture-annotation-receipt.json',
  'capture-annotation-semantic-snapshot.json',
  'capture-annotation-db-summary.json'
];

const APP_ID = 'com.foliole.android';
const TEST_APP_ID = `${APP_ID}.test`;
const TEST_CLASS = `${APP_ID}.FolioleCompanionWebViewAutomationTest#persistsCaptureClozeAndNoteAfterRestart`;
const TEST_RUNNER = `${TEST_APP_ID}/androidx.test.runner.AndroidJUnitRunner`;
const TEST_RUNNER_IDENTITY = `instrumentation:${TEST_RUNNER} (target=${APP_ID})`;

function failure(message, stage, result) {
  return Object.assign(new Error(message), { exitCode: 74, result, stage });
}

async function checked(execute, command, args, options, stage) {
  let result;
  try { result = await execute(command, args, options); }
  catch (error) { throw failure(error.message, stage, error); }
  if (result.code === 0) return result;
  const detail = result.lines?.at(-1) || result.stderr || `${command} exited ${result.code}`;
  throw failure(String(detail).trim(), stage, result);
}

function parseBundleJson(output, key) {
  const prefix = `INSTRUMENTATION_STATUS: ${key}=`;
  const line = String(output).split(/\r?\n/u).find((entry) => entry.startsWith(prefix));
  if (!line) throw failure(`Instrumentation did not emit ${key}`, 'instrumentation-evidence');
  try { return JSON.parse(line.slice(prefix.length)); }
  catch { throw failure(`Instrumentation emitted invalid ${key}`, 'instrumentation-evidence'); }
}

export function parseCaptureAnnotationInstrumentation(output, token) {
  if (!/^INSTRUMENTATION_CODE: -1$/mu.test(output)) {
    throw failure('Capture annotation instrumentation did not complete successfully', 'instrumentation');
  }
  const receipt = parseBundleJson(output, 'folioleActionReceipt');
  const semanticSnapshot = parseBundleJson(output, 'folioleAfterSemantic');
  const required = ['captureCreated', 'clozeCreated', 'noteCreated', 'hydratedAfterRestart'];
  if (receipt.ok !== true || receipt.token !== token
      || receipt.targetTestId !== 'companion-capture-annotation-persistence'
      || required.some((key) => receipt[key] !== true)) {
    throw failure('Capture annotation receipt is incomplete or belongs to another run', 'instrumentation-evidence');
  }
  if (!semanticSnapshot || typeof semanticSnapshot !== 'object') {
    throw failure('Restart semantic snapshot is missing', 'instrumentation-evidence');
  }
  return { receipt, semanticSnapshot };
}

function writeJson(fsApi, filePath, value) {
  fsApi.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function artifactPaths(evidenceRoot) {
  return Object.fromEntries(CAPTURE_ANNOTATION_EVIDENCE_FILES.map((name) => [name, path.join(evidenceRoot, name)]));
}

function packageField(output, field) {
  return new RegExp(`^\\s*${field}=(.+)$`, 'mu').exec(output)?.[1]?.trim();
}

function parseInstalledPackage(packageName, detailsOutput, pathsOutput) {
  if (!String(detailsOutput).includes(`Package [${packageName}]`)) {
    throw failure(`Required installed package is missing: ${packageName}`, 'installed-package');
  }
  const codePaths = String(pathsOutput).split(/\r?\n/u)
    .filter((line) => line.startsWith('package:')).map((line) => line.slice('package:'.length).trim())
    .filter(Boolean);
  const identity = {
    codePaths, firstInstallTime: packageField(detailsOutput, 'firstInstallTime'),
    lastUpdateTime: packageField(detailsOutput, 'lastUpdateTime'), packageName,
    versionCode: packageField(detailsOutput, 'versionCode')?.split(/\s+/u)[0],
    versionName: packageField(detailsOutput, 'versionName')
  };
  if (codePaths.length === 0 || Object.values(identity).some((value) => value === undefined)) {
    throw failure(`Installed package identity is incomplete: ${packageName}`, 'installed-package');
  }
  return identity;
}

async function queryInstalledPackage({ adbPort, env, execute, packageName, paths, serial }) {
  const prefix = ['-P', adbPort, '-s', serial, 'shell'];
  const options = commandOptions(env, 'capture_package_query_timeout', 30_000);
  const details = await checked(execute, paths.adbPath,
    [...prefix, 'dumpsys', 'package', packageName], options, 'installed-package');
  const packagePaths = await checked(execute, paths.adbPath,
    [...prefix, 'pm', 'path', packageName], options, 'installed-package');
  return parseInstalledPackage(packageName, details.stdout, packagePaths.stdout);
}

async function requireInstalledScenario({ adbPort, env, execute, paths, serial }) {
  const main = await queryInstalledPackage({ adbPort, env, execute, packageName: APP_ID, paths, serial });
  let test;
  try {
    test = await queryInstalledPackage({ adbPort, env, execute, packageName: TEST_APP_ID, paths, serial });
  } catch (error) {
    error.installedPackages = { main };
    throw error;
  }
  const installedPackages = { main, test };
  const runners = await checked(execute, paths.adbPath,
    ['-P', adbPort, '-s', serial, 'shell', 'pm', 'list', 'instrumentation'],
    commandOptions(env, 'capture_runner_query_timeout', 30_000), 'installed-instrumentation');
  if (!String(runners.stdout).split(/\r?\n/u).map((line) => line.trim()).includes(TEST_RUNNER_IDENTITY)) {
    const error = failure(
      'Required installed capture annotation instrumentation is unavailable', 'installed-instrumentation'
    );
    error.installedPackages = installedPackages;
    throw error;
  }
  return installedPackages;
}

function auditSnapshot({ auditDatabase, fsApi, openDatabase, snapshotManifest, token }) {
  let snapshot;
  try { snapshot = JSON.parse(fsApi.readFileSync(snapshotManifest, 'utf8')); }
  catch { throw failure('Android database snapshot manifest is unreadable', 'capture-database-snapshot'); }
  if (!snapshot.backup?.created || !snapshot.backup.databasePath) {
    throw failure('Android database snapshot path is missing', 'capture-database-snapshot');
  }
  let database;
  try {
    database = openDatabase(snapshot.backup.databasePath);
    return auditDatabase(database, token);
  } catch (error) {
    throw failure(error.message, 'capture-database-audit', error);
  } finally { database?.close(); }
}

function commandOptions(env, timeoutCode, timeoutMs) {
  return { env, timeoutCode, timeoutMs, windowsHide: true };
}

export async function runWindowsA5CaptureAnnotation({
  adbPort, auditDatabase = auditCaptureAnnotationDatabase, buildIdentity, env,
  evidenceRoot, execute, fsApi = fs, openDatabase = openReadonlySqliteDatabaseSync,
  paths, protectData, serial
}) {
  fsApi.mkdirSync(evidenceRoot, { recursive: true });
  const artifacts = artifactPaths(evidenceRoot);
  const snapshotManifest = path.join(evidenceRoot, 'capture-annotation-database-snapshot.json');
  const snapshotRoot = path.join(evidenceRoot, 'capture-annotation-database');
  let installedPackages;
  let instrumentationStarted = false;
  let primaryError = null;
  let quiesced = false;
  let result;
  try {
    installedPackages = await requireInstalledScenario({ adbPort, env, execute, paths, serial });
    instrumentationStarted = true;
    const instrumentation = await checked(execute, paths.adbPath, [
      '-P', adbPort, '-s', serial, 'shell', 'am', 'instrument', '-w', '-r',
      '-e', 'expectedValue', buildIdentity, '-e', 'timeoutMs', '30000',
      '-e', 'class', TEST_CLASS, TEST_RUNNER
    ], commandOptions(env, 'capture_instrumentation_timeout', 3 * 60_000), 'instrumentation');
    let evidence;
    try { evidence = parseCaptureAnnotationInstrumentation(instrumentation.stdout, buildIdentity); }
    catch (error) {
      error.result = instrumentation;
      throw error;
    }
    writeJson(fsApi, artifacts['capture-annotation-receipt.json'], evidence.receipt);
    writeJson(fsApi, artifacts['capture-annotation-semantic-snapshot.json'], evidence.semanticSnapshot);
    await checked(execute, paths.adbPath,
      ['-P', adbPort, '-s', serial, 'shell', 'am', 'force-stop', APP_ID],
      commandOptions(env, 'capture_quiesce_timeout', 30_000), 'capture-quiesce');
    quiesced = true;
    await protectData('backup', snapshotManifest, snapshotRoot);
    const audit = auditSnapshot({ auditDatabase, fsApi, openDatabase, snapshotManifest, token: buildIdentity });
    writeJson(fsApi, artifacts['capture-annotation-db-summary.json'], audit);
    const manifest = {
      action: 'capture-annotation', artifacts: Object.fromEntries(
        CAPTURE_ANNOTATION_EVIDENCE_FILES.slice(1).map((name) => [name, name])
      ), completedAt: new Date().toISOString(), nodes: {
        capture: audit.capture, cloze: audit.cloze, note: audit.note
      }, installedPackages, resultStatus: 'success', runId: buildIdentity, schemaVersion: 1,
      serial, testClass: TEST_CLASS, token: buildIdentity
    };
    writeJson(fsApi, artifacts['capture-annotation-manifest.json'], manifest);
    result = {
      captureAnnotation: { buildIdentity, manifestPath: artifacts['capture-annotation-manifest.json'] },
      output: instrumentation.output
    };
  } catch (error) {
    if (installedPackages && !error.installedPackages) error.installedPackages = installedPackages;
    primaryError = error;
  }
  if (instrumentationStarted && !quiesced) {
    await checked(execute, paths.adbPath,
      ['-P', adbPort, '-s', serial, 'shell', 'am', 'force-stop', APP_ID],
      commandOptions(env, 'capture_cleanup_timeout', 30_000), 'capture-cleanup');
  }
  if (primaryError) throw primaryError;
  return result;
}
