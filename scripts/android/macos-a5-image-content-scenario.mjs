import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { runMacosA5SyncGroupMaintenance } from '../sync-group/a5-sync-group-action.mjs';

import { ACCEPTANCE_APP_ID } from './macos-a5-acceptance-package-cleanup.mjs';
import { assertImageContentFact, readAndroidImageFact, readMacImageFact } from './macos-a5-image-content-evidence.mjs';
import {
  ANDROID_MARKER, IMAGE_NAME, INITIAL_BODY, assertLoadedImages, connectImageWebView,
  editAndroidBody, imageDevice, openAndroidImageTopic, pasteMacImage
} from './macos-a5-image-content-ui.mjs';
import { observeAndAccept } from './macos-a5-single-principal-join.mjs';

async function joinImageGroup({ args, env, evidenceRoot, mechanics, session }) {
  const overview = await session.enable();
  const result = await mechanics({ appId: ACCEPTANCE_APP_ID, buildIdentity: args.buildIdentity(), env,
    evidenceRoot: path.join(evidenceRoot, 'join'), execute: args.execute, paths: args.paths, serial: args.serial,
    expectedGroupId: overview.sync_group.group_id, expectedGroupTag: overview.sync_group.group_tag,
    instrumentationArgs: ['-e', 'joinOnly', 'true'], instrumentationOwnsActivity: true,
    observeConcurrently: true, observeWhileTransportOpen: options => observeAndAccept(session, options),
    restartApp: true, testClass: 'com.foliole.android.FolioleCompanionSyncGroupJoinTest',
    validateInstrumentation: ({ stdout }) => {
      assert.match(stdout, /"joined":true/u); assert.match(stdout, /"restarted":true/u);
    } });
  await runMacosA5SyncGroupMaintenance({ action: 'activate-participation', appId: ACCEPTANCE_APP_ID,
    buildIdentity: args.buildIdentity(), env, evidenceRoot: path.join(evidenceRoot, 'automatic-enabled'),
    execute: args.execute, installMain: false, paths: args.paths, serial: args.serial });
  return result.observation.groupId;
}

async function createImageTopic(session, nodeId) {
  const workspace = await session.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
  const now = new Date().toISOString();
  const title = `T363 image ${nodeId.slice(-8)}`;
  const result = await session.invoke('create_topic', { activeNodeId: nodeId, anchorLink: null,
    content: INITIAL_BODY, createdAt: now, updatedAt: now, isTitleManual: true, kind: 'topic',
    nodeId, nodeOrder: [...workspace.nodeOrder, nodeId], parentNodeId: 'special-inbox',
    position: workspace.nodeOrder.length, reveal: null, title });
  assert.ok(result.createdNodeIds.includes(nodeId));
  return title;
}

function startAndroid(args) {
  args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'start', '-W', '-n',
    `${ACCEPTANCE_APP_ID}/com.foliole.android.MainActivity`]);
}

async function requestAndroidImageSync(page, evidenceRoot) {
  try {
    await page.getByTestId('companion-tab-settings').click();
    await page.getByTestId('companion-settings-sync').click();
    await page.getByTestId('companion-sync-now').click();
  } catch (error) {
    await page.screenshot({ path: path.join(evidenceRoot, 'android-navigation-failure.png') });
    fs.writeFileSync(path.join(evidenceRoot, 'android-navigation-failure.txt'),
      `${page.url()}\n${await page.locator('body').innerText()}`);
    throw error;
  }
}

async function runImageRoundTrip({ args, device, evidenceRoot, receipt, restartMacos, session }) {
  const { nodeId } = receipt;
  receipt.stage = 'mac-insert';
  const title = await createImageTopic(session, nodeId);
  const before = await readMacImageFact(evidenceRoot, nodeId);
  const saved = await pasteMacImage(session, args, nodeId);
  const mac = await readMacImageFact(evidenceRoot, nodeId);
  assertImageContentFact(mac, saved.content, IMAGE_NAME);
  assert.equal(mac.versions, before.versions + 1);
  let binding = await connectImageWebView(args, device);
  receipt.stage = 'android-receive';
  receipt.firstWebView = { pid: binding.pid, socket: binding.socket };
  await requestAndroidImageSync(binding.page, evidenceRoot);
  await openAndroidImageTopic(binding.page, title, nodeId);
  await assertLoadedImages(binding.page, '[data-companion-readable-document] img');
  await binding.page.screenshot({ path: path.join(evidenceRoot, 'android-received-image.png') });
  const waiting = session.waitForState({ command: 'load_node_document', commandArgs: { nodeId },
    condition: { kind: 'node-content-includes', nodeId, fragments: [ANDROID_MARKER] },
    eventName: 'onWorkspaceSyncApplied' });
  receipt.stage = 'android-edit';
  await editAndroidBody(binding.page, saved.content);
  const returned = await waiting;
  assert.equal(returned.content, `${saved.content}\n\n${ANDROID_MARKER}`);
  const android = await readAndroidImageFact(args, nodeId);
  assertImageContentFact(android, returned.content, IMAGE_NAME);
  startAndroid(args);
  receipt.stage = 'android-restart';
  binding = await connectImageWebView(args, device);
  receipt.restartedWebView = { pid: binding.pid, socket: binding.socket };
  assert.notEqual(receipt.restartedWebView.pid, receipt.firstWebView.pid);
  await openAndroidImageTopic(binding.page, title, nodeId);
  await binding.page.getByText(ANDROID_MARKER, { exact: true }).waitFor();
  await assertLoadedImages(binding.page, '[data-companion-readable-document] img');
  await binding.page.screenshot({ path: path.join(evidenceRoot, 'android-restarted-image.png') });
  session = await restartMacos(receipt.groupId);
  receipt.stage = 'mac-restart';
  const restarted = await session.invoke('load_node_document', { nodeId });
  assert.equal(restarted.content, returned.content);
  const finalMac = await readMacImageFact(evidenceRoot, nodeId);
  assertImageContentFact(finalMac, returned.content, IMAGE_NAME);
  await session.page.locator(`[role="treeitem"][data-node-id="${nodeId}"]`).click();
  await assertLoadedImages(session.page, '.prompt-editor-host img.cm-md-image-element');
  await session.page.screenshot({ path: path.join(evidenceRoot, 'macos-restarted-image.png') });
  const finalAndroid = await readAndroidImageFact(args, nodeId);
  assertImageContentFact(finalAndroid, returned.content, IMAGE_NAME);
  startAndroid(args);
  receipt.facts = { macInserted: mac, androidSaved: android, macRestarted: finalMac, androidRestarted: finalAndroid };
}

export async function runImageContentScenario(context) {
  const { args, evidenceRoot } = context;
  const receipt = { nodeId: `t363-image-${args.buildIdentity()}`, status: 'joining' };
  const save = () => fs.writeFileSync(path.join(evidenceRoot, 'result.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  let connection;
  try {
    save();
    receipt.groupId = await joinImageGroup(context);
    receipt.status = 'editing'; save();
    connection = await imageDevice(args.serial);
    await runImageRoundTrip({ ...context, device: connection.device, receipt });
    receipt.status = 'passed';
  } catch (error) {
    receipt.status = 'failed'; receipt.error = error.message;
    await context.session.page.screenshot({ path: path.join(evidenceRoot, 'macos-failure.png') }).catch(() => undefined);
    throw error;
  } finally { try { await connection?.close(); } finally { save(); } }
}
