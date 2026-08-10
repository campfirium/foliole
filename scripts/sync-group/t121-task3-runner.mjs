#!/usr/bin/env node
/* global console, process */

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import { inspectPairSyncRecoveryWorkspace } from '../android/android-pair-sync-recovery-readiness.mjs';
import { collectAndroidDeviceSnapshot } from '../android/android-device-snapshot.mjs';
import { A5_SERIAL, macosA5Paths } from '../android/macos-a5-dev.mjs';
import { openMacosPairSyncDesktopSession } from '../android/macos-pair-sync-desktop-session.mjs';
import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import { MACOS_DAILY_DEBUG_ROOT, MACOS_DAILY_LIBRARY_HOME } from '../macos/macos-electron-dev-paths.mjs';
import { authorizationDigest, createTask3Authorization } from './t121-task3-authorization.mjs';
import {
  assertTask3Complete, assertTask3Receipt, createTask3Manifest, TASK3_STEPS
} from './t121-task3-contract.mjs';

function execute(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(output)
      : reject(Object.assign(new Error(output.trim() || `${command} exited ${code}`), { output })));
  });
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function frozenCandidate(root) {
  const verification = JSON.parse(fs.readFileSync(
    path.join(root, '.tmp/artifacts/t121-candidate-verifications.json'), 'utf8'
  ));
  return { branch: git(root, ['branch', '--show-current']), clean: git(root, ['status', '--porcelain']) === '',
    committed: true, revision: git(root, ['rev-parse', 'HEAD']),
    treeDigest: git(root, ['rev-parse', 'HEAD^{tree}']), verifications: verification.verifications };
}

function artifactRoot(root, revision) {
  return path.join(root, '.tmp/artifacts/t121-task3', revision);
}

export function prepareTask3Authorization(root = process.cwd()) {
  const request = createTask3Authorization(frozenCandidate(root));
  const requestPath = path.join(artifactRoot(root, request.boundary.candidate.revision),
    'authorization-request.json');
  fs.mkdirSync(path.dirname(requestPath), { recursive: true });
  fs.writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`, 'utf8');
  return { request, requestPath };
}

function evidence(output, pattern, label) {
  const match = pattern.exec(output);
  if (!match) throw new Error(`${label} did not report fixed evidence.`);
  return match[1];
}

async function node(root, script, args = []) {
  return execute(process.execPath, [path.join(root, script), ...args], { cwd: root });
}

function androidPoint(manifest, expected) {
  const db = manifest.snapshot.database;
  const facts = db.inspection;
  if (db.integrity !== 'ok' || facts.syncGroupId !== expected.groupId
      || facts.syncGroupTimelineId !== expected.timelineId || facts.activeSyncGroupMemberCount !== 3
      || facts.missingAttachmentCount !== 0 || facts.missingContentBlobCount !== 0) {
    throw new Error('Android B task 2 protection is incomplete.');
  }
  return { counts: { attachments: db.counts.attachments, contentBlobs: db.counts.content_blobs,
    missingAttachments: facts.missingAttachmentCount,
    missingContentBlobs: facts.missingContentBlobCount, nodes: db.counts.nodes }, device: 'B',
  deviceIdentity: facts.deviceIdentityFingerprint, groupId: facts.syncGroupId, integrity: 'ok',
  localMemberState: 'active', restorable: true, restorePoint: manifest.backup.manifestPath,
  timelineId: facts.syncGroupTimelineId };
}

function device(point, activeMemberCount = 3) {
  return { activeMemberCount, counts: point.counts, device: point.device, groupId: point.groupId,
    localMemberState: point.localMemberState, timelineId: point.timelineId };
}

async function buildBaseline(root, candidate) {
  const mac = await node(root, 'scripts/macos/macos-sync-group-library-protection.mjs',
    ['--label', 'original', '--candidate', candidate.revision]);
  const aPath = evidence(mac, /evidence=([^\r\n]+)/u, 'macOS A protection');
  const bOriginal = await node(root, 'scripts/android/macos-a5-dev.mjs', ['protect-original']);
  evidence(bOriginal, /protect-original evidence=([^\r\n]+)/u, 'Android B protection');
  await node(root, 'scripts/windows/windows-dev-control.mjs', ['sync-group-baseline-reset']);
  await node(root, 'scripts/android/macos-a5-sync-group-baseline-inspect.mjs');
  await node(root, 'scripts/android/macos-a5-dev.mjs', ['approve-windows-join']);
  const bProtected = await node(root, 'scripts/android/macos-a5-dev.mjs', ['protect-baseline']);
  const bPath = evidence(bProtected, /protect-baseline evidence=([^\r\n]+)/u, 'Android B task 2 protection');
  const cProtected = await node(root, 'scripts/windows/windows-dev-control.mjs', ['sync-group-task3-protect']);
  const cIdentity = evidence(cProtected,
    /sync-group-task3-protect identity=([A-Za-z0-9.-]+)/u, 'Windows C task 2 protection');
  const cPath = path.join(root, '.tmp/artifacts/sync-group-task3-protection', cIdentity,
    'sync-group-task3-protection.json');
  const a = JSON.parse(fs.readFileSync(aPath, 'utf8')).protection;
  const expected = { groupId: a.groupId, timelineId: a.timelineId };
  const b = androidPoint(JSON.parse(fs.readFileSync(bPath, 'utf8')), expected);
  const c = JSON.parse(fs.readFileSync(cPath, 'utf8')).protection;
  return { devices: { A: device(a, 2), B: device(b), C: device(c) }, ...expected,
    restorePoints: { A: a, B: b, C: c } };
}

async function waitForMac(session, requiredIds, timeoutMs = 12 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  let snapshot;
  while (Date.now() < deadline) {
    const overview = await session.load();
    snapshot = await session.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
    const active = overview.sync_group?.members.filter(({ state }) => state === 'active').length;
    if (active === 3 && requiredIds.every((id) => snapshot.nodesById?.[id])) return snapshot;
    await delay(1_000);
  }
  throw new Error('macOS A did not converge on the required task 3 facts.');
}

async function waitForMacMembers(session, timeoutMs = 4 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const group = (await session.load()).sync_group;
    if (group?.members.filter(({ state }) => state === 'active').length === 3) return group;
    await delay(1_000);
  }
  throw new Error('macOS A did not rejoin the three-member group.');
}

async function androidSnapshot(root) {
  const paths = macosA5Paths(root);
  return collectAndroidDeviceSnapshot({ adb: paths.adb, appId: 'com.foliole.android',
    databaseInspector: inspectPairSyncRecoveryWorkspace, includeEvents: false,
    serial: A5_SERIAL, tables: ['nodes', 'content_blobs', 'attachments'] });
}

function finalPoint(deviceName, facts, counts) {
  return { activeMemberCount: facts.activeMemberCount ?? facts.activeSyncGroupMemberCount,
    counts: { attachments: counts.attachments, contentBlobs: counts.contentBlobs,
      missingAttachments: facts.missingAttachmentCount,
      missingContentBlobs: facts.missingContentBlobCount, nodes: counts.nodes }, device: deviceName,
  groupId: facts.localGroupId ?? facts.syncGroupId, localMemberState: 'active',
  timelineId: facts.localTimelineId ?? facts.syncGroupTimelineId };
}

async function runJourney(root, manifest) {
  const remote = node(root, 'scripts/windows/windows-dev-control.mjs', ['sync-group-task3']);
  await node(root, 'scripts/android/macos-a5-dev.mjs', ['resume-sync-group']);
  const session = await openMacosPairSyncDesktopSession({ repoRoot: root,
    userDataPath: path.join(root, MACOS_DAILY_DEBUG_ROOT, 'user-data') });
  let macSnapshot;
  let aFact;
  let cPath;
  let cReceipt;
  let ids;
  try {
    await waitForMacMembers(session);
    aFact = await createDesktopSyncGroupJourneyFact({ device: 'A',
      evidenceRoot: artifactRoot(root, manifest.candidate.revision), session });
    await node(root, 'scripts/android/macos-a5-dev.mjs', ['create-journey-fact']);
    const remoteOutput = await remote;
    const cIdentity = evidence(remoteOutput,
      /sync-group-task3 identity=([A-Za-z0-9.-]+)/u, 'Windows C task 3');
    cPath = path.join(root, '.tmp/artifacts/sync-group-task3', cIdentity,
      'sync-group-task3-receipt.json');
    cReceipt = JSON.parse(fs.readFileSync(cPath, 'utf8'));
    const excluded = new Set(Object.keys(cReceipt.initialJourneyFacts ?? {}));
    const fresh = Object.entries(cReceipt.restarted.journeyFacts ?? {})
      .filter(([id]) => !excluded.has(id));
    ids = { A: aFact.factId,
      ...Object.fromEntries(fresh.map(([id, origin]) => [origin, id])) };
    macSnapshot = await waitForMac(session, Object.values(ids));
  } finally { await session.close(); }
  const reopened = await openMacosPairSyncDesktopSession({ repoRoot: root,
    userDataPath: path.join(root, MACOS_DAILY_DEBUG_ROOT, 'user-data') });
  try { macSnapshot = await waitForMac(reopened, Object.values(ids)); } finally { await reopened.close(); }
  await node(root, 'scripts/android/macos-a5-dev.mjs', ['resume-sync-group']);
  const b = await androidSnapshot(root);
  const electron = path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
  const inspector = path.join(root, 'scripts/windows/windows-sync-group-recovery-inspect.mjs');
  const aFacts = JSON.parse(execFileSync(electron, [inspector,
    path.join(MACOS_DAILY_LIBRARY_HOME, 'Data', 'foliole.db')], {
    cwd: root, encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  }));
  const devices = {
    A: finalPoint('A', aFacts, { attachments: aFacts.attachmentCount,
      contentBlobs: aFacts.contentBlobCount, nodes: aFacts.nodeCount }),
    B: finalPoint('B', b.database.inspection, { attachments: b.database.counts.attachments,
      contentBlobs: b.database.counts.content_blobs, nodes: b.database.counts.nodes }),
    C: finalPoint('C', cReceipt.restarted, { attachments: cReceipt.restarted.attachmentCount,
      contentBlobs: cReceipt.restarted.contentBlobCount, nodes: cReceipt.restarted.nodeCount })
  };
  void macSnapshot;
  for (const step of TASK3_STEPS) {
    const origin = step.endsWith('-fact-converges') ? step[0].toUpperCase() : null;
    const receipt = { evidence: { boundaryDigest: manifest.boundaryDigest, devices,
      ...(origin ? { factId: ids[origin], origin, visibleOn: ['A', 'B', 'C'] } : {}) },
    evidenceRef: cPath, resultStatus: 'success', step };
    assertTask3Receipt(manifest, step, receipt);
  }
  assertTask3Complete(manifest);
}

export async function executeTask3({ authorization, root = process.cwd() }) {
  const candidate = frozenCandidate(root);
  const request = JSON.parse(fs.readFileSync(path.join(artifactRoot(root, candidate.revision),
    'authorization-request.json'), 'utf8'));
  if (authorization !== request.authorizationDigest || authorizationDigest(request) !== authorization) {
    throw new Error('T121 task 3 authorization does not match the frozen candidate.');
  }
  const manifest = createTask3Manifest({ baseline: await buildBaseline(root, candidate), candidate });
  const manifestPath = path.join(artifactRoot(root, candidate.revision), 'task3-manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await runJourney(root, manifest);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { manifestPath };
}

async function main(argv) {
  if (argv.length === 1 && argv[0] === 'prepare') return prepareTask3Authorization();
  if (argv.length === 3 && argv[0] === 'execute' && argv[1] === '--authorization') {
    return executeTask3({ authorization: argv[2] });
  }
  throw new Error('usage: t121-task3-runner <prepare|execute --authorization digest>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((result) => console.log(`[t121-task3] ${JSON.stringify(result)}`))
    .catch((error) => { console.error(`[t121-task3] ${error.message}`); process.exitCode = 1; });
}
