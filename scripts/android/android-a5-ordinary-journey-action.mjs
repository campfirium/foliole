/* global console, process */

import fs from 'node:fs';
import path from 'node:path';

import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import { assertMacosAcceptanceSyncGroupServer } from '../sync-group/multi-device-sync-macos-channel.mjs';
import { buildA5TwoDeviceAcceptance } from './a5-two-device-build.mjs';
import { validateA5TwoDeviceJoin } from './a5-two-device-join-evidence.mjs';
import {
  A5_ORDINARY_APP_ID, A5_ORDINARY_EVIDENCE_FILES,
  A5_ORDINARY_TEST_CLASS, ordinaryJourneyArtifactPaths,
  parseA5OrdinaryJourneyInstrumentation
} from './android-a5-ordinary-journey-contract.mjs';
import {
  openMacosSyncGroupDesktopSession, waitForMacosDeviceRequest
} from './macos-sync-group-desktop-session.mjs';
import { runMacosA5InstrumentationMechanics } from './macos-a5-sync-group-maintenance-action.mjs';

const JOIN_TEST = 'com.foliole.android.FolioleCompanionSyncGroupJoinTest' +
  '#joinsOrdinaryGroupAndPersistsAfterRestart';
const SYNCED_CONTENT = 'Multi-device';

function writeJson(fsApi, filePath, value) {
  fsApi.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function acceptOnlyRequest(session, options, waitForRequest) {
  const request = await waitForRequest(session, null, options);
  await session.accept(request.request_id);
  const overview = await session.load();
  const joined = overview.sync_group?.devices?.find(
    (device) => device.device_name === request.device_name
  );
  if (!joined) throw new Error('Mac did not persist the A5 ordinary journey Device.');
  return { deviceId: joined.device_identity_key, requestId: request.request_id };
}

async function packageInstalled(args, applicationId) {
  const result = await args.execute(args.paths.adb,
    ['-s', args.serial, 'shell', 'pm', 'list', 'packages', applicationId],
    { env: args.env, timeoutCode: 'ordinary_package_query_timeout', timeoutMs: 30_000 });
  if (result.code !== 0) throw Object.assign(new Error('Acceptance package query failed'), { result });
  return result.stdout.split(/\r?\n/u).some((line) => line.trim() === `package:${applicationId}`);
}

async function removeAcceptancePackages(args) {
  const output = [];
  for (const applicationId of [`${A5_ORDINARY_APP_ID}.test`, A5_ORDINARY_APP_ID]) {
    if (!await packageInstalled(args, applicationId)) continue;
    const result = await args.execute(args.paths.adb, ['-s', args.serial, 'uninstall', applicationId],
      { env: args.env, timeoutCode: 'ordinary_cleanup_timeout', timeoutMs: 60_000 });
    output.push(result.output);
    if (result.code !== 0 || !/^Success\s*$/mu.test(result.stdout)
        || await packageInstalled(args, applicationId)) {
      throw Object.assign(new Error(`Acceptance package cleanup failed: ${applicationId}`), { result });
    }
  }
  return { mainPackageRemoved: true, output: output.join(''), testPackageRemoved: true };
}

export async function runMacosA5OrdinaryJourneyEntry(input, dependencies = {}) {
  const buildAcceptance = dependencies.buildAcceptance ?? buildA5TwoDeviceAcceptance;
  const createFact = dependencies.createFact ?? createDesktopSyncGroupJourneyFact;
  const mechanics = dependencies.mechanics ?? runMacosA5InstrumentationMechanics;
  const openSession = dependencies.openSession ?? openMacosSyncGroupDesktopSession;
  const assertServer = dependencies.assertServer ?? assertMacosAcceptanceSyncGroupServer;
  const validateJoin = dependencies.validateJoin ?? validateA5TwoDeviceJoin;
  const waitForRequest = dependencies.waitForRequest ?? waitForMacosDeviceRequest;
  const fsApi = input.fsApi ?? fs;
  input.assertFixed();
  const env = buildAcceptance(input);
  const runId = input.buildIdentity();
  const evidenceRoot = path.join(input.paths.artifactsRoot, 'a5-ordinary-journey', runId);
  fsApi.mkdirSync(evidenceRoot, { recursive: true });
  const artifacts = ordinaryJourneyArtifactPaths(evidenceRoot);
  let session;
  let journeyError;
  let proof;
  try {
    session = await openSession({ env, libraryHome: path.join(evidenceRoot, 'macos-library'),
      repoRoot: input.paths.buildRoot, runtimeRoot: path.join(evidenceRoot, 'macos-runtime') });
    const desktopFact = await createFact({ device: 'A',
      evidenceRoot: path.join(evidenceRoot, 'desktop-fact'), session });
    const provider = assertServer(await session.enable());
    const join = await mechanics({ appId: A5_ORDINARY_APP_ID, buildIdentity: runId, env,
      evidenceRoot: path.join(evidenceRoot, 'join'), execute: input.execute,
      expectedGroupId: provider.sync_group.group_id,
      expectedGroupTag: provider.sync_group.group_tag, observeConcurrently: true,
      observeWhileTransportOpen: (options) => acceptOnlyRequest(session, options, waitForRequest),
      paths: input.paths, serial: input.serial, testClass: JOIN_TEST,
      validateInstrumentation: (evidence) => validateJoin({ ...evidence, args: input }) });
    const ordinary = await mechanics({ appId: A5_ORDINARY_APP_ID, buildIdentity: runId, env,
      evidenceRoot: path.join(evidenceRoot, 'product-journey'), execute: input.execute,
      installMain: false, instrumentationArgs: [
        '-e', 'expectedValue', runId, '-e', 'expectedSyncedText', SYNCED_CONTENT,
        '-e', 'timeoutMs', '30000'
      ], paths: input.paths, serial: input.serial, testClass: A5_ORDINARY_TEST_CLASS });
    const product = parseA5OrdinaryJourneyInstrumentation(ordinary.stdout, runId);
    writeJson(fsApi, artifacts['ordinary-journey-receipt.json'], product.receipt);
    writeJson(fsApi, artifacts['ordinary-journey-semantic-snapshot.json'], product.semanticSnapshot);
    proof = { desktopFact, join, product };
    process.stdout.write(`${join.output}${ordinary.output}`);
  } catch (error) { journeyError = error; }
  let cleanup;
  const cleanupErrors = [];
  try { await session?.close(); } catch (error) { cleanupErrors.push(error); }
  try { cleanup = await removeAcceptancePackages({ ...input, env }); }
  catch (error) { cleanupErrors.push(error); }
  if (journeyError || cleanupErrors.length > 0) {
    const errors = [...(journeyError ? [journeyError] : []), ...cleanupErrors];
    if (errors.length === 1) throw errors[0];
    throw new AggregateError(errors, 'A5 ordinary journey or resource cleanup failed.');
  }
  process.stdout.write(cleanup.output);
  if (journeyError) throw journeyError;
  const manifest = {
    action: 'ordinary-journey', applicationId: A5_ORDINARY_APP_ID,
    artifacts: Object.fromEntries(A5_ORDINARY_EVIDENCE_FILES.slice(1).map((name) => [name, name])),
    cleanup, completedAt: new Date().toISOString(), desktopFactId: proof.desktopFact.factId,
    joinedDeviceId: proof.join.observation.deviceId,
    result: Object.fromEntries([
      'captureCreated', 'syncedContentVisible', 'visibleBeforeRelaunch', 'visibleAfterRelaunch'
    ].map((key) => [key, proof.product.receipt[key]])),
    resultStatus: 'success', runId, schemaVersion: 1, serial: input.serial,
    testClass: A5_ORDINARY_TEST_CLASS
  };
  writeJson(fsApi, artifacts['ordinary-journey-manifest.json'], manifest);
  console.log(`[macos-a5-dev] ordinary-journey evidence=${artifacts['ordinary-journey-manifest.json']}`);
  return { evidenceRoot, manifestPath: artifacts['ordinary-journey-manifest.json'] };
}
