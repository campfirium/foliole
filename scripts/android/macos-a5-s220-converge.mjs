/* global console */

import fs from 'node:fs';
import path from 'node:path';

import { macosAcceptanceEnv } from '../sync-group/multi-device-sync-macos-channel.mjs';
import { runMacosA5SyncGroupMaintenance } from '../sync-group/a5-sync-group-action.mjs';
import { observeMacosAnchorAfterElection } from './macos-a5-anchor-observation.mjs';
import { openMacosSyncGroupDesktopSession } from './macos-sync-group-desktop-session.mjs';
import { readS220FinalFixture } from './macos-a5-s220-final-fixture.mjs';
import { inspectS220A5Group } from './macos-a5-s220-group-inspect.mjs';
import { S220_APP_ID, inspectS220A5Packages } from './macos-a5-s220-package-inventory.mjs';

const C_ID = 'multi-device-sync-c-20260921012258100';

async function readDesktop(session, fixture) {
  const snapshot = await session.invoke('load_workspace_list_snapshot', {
    includePdfOpenings: false
  });
  const document = await session.invoke('load_node_document', { nodeId: C_ID });
  const conflicts = await session.invoke('load_sync_node_conflicts', { objectIds: [C_ID] });
  return { cVersion: snapshot.nodesById[C_ID]?.currentVersionId,
    cBodyContainsMarker: document?.content?.includes(fixture.marker) ?? false,
    itemReview: snapshot.nodesById[fixture.itemId]?.review ?? null,
    conflicts: conflicts?.length ?? null };
}

export async function convergeS220A5(args) {
  const { assertFixed, buildIdentity, env, execute, paths, serial } = args;
  const root = path.join(paths.artifactsRoot, 'S220', 'final-same-tip', 'a5-converge');
  const receiptPath = path.join(root, 'receipt.json');
  if (fs.existsSync(receiptPath)) throw new Error('S220 convergence already attempted.');
  const inventory = await inspectS220A5Packages({ assertFixed, execute, paths, serial });
  if (!inventory.receipt.packages[S220_APP_ID].installed) throw new Error('S220 app missing.');
  const beforePath = await inspectS220A5Group({ assertFixed, paths, serial });
  const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
  const fixture = readS220FinalFixture(paths);
  const previousRoot = path.dirname(root);
  const reviewed = JSON.parse(fs.readFileSync(path.join(previousRoot, 'a5-offline',
    'receipt.json'), 'utf8'));
  const edited = JSON.parse(fs.readFileSync(path.join(previousRoot, 'a5-offline-edit',
    'receipt.json'), 'utf8'));
  const c = before.inspection.journeyFacts.find((node) => node.id === C_ID);
  const item = before.inspection.review.find((node) => node.node_id === fixture.itemId);
  if (fixture.groupId !== before.inspection.group.group_id
    || reviewed.resultStatus !== 'success' || edited.resultStatus !== 'success'
    || c?.current_version_id !== edited.after.current_version_id
    || c.body_blob_hash !== edited.after.body_blob_hash || c.body_bytes <= 0
    || item?.reps !== 1 || before.counts.review_log !== reviewed.after.counts.review_log) {
    throw new Error('S220 offline edit or review baseline changed before convergence.');
  }
  fs.mkdirSync(root, { recursive: true });
  const receipt = { appId: S220_APP_ID, before: { c, item,
    counts: before.counts, attachments: before.attachments }, stage: 'baseline' };
  const save = () => fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  save();
  const sharedRoot = path.join(paths.artifactsRoot, 'S220', 'fri-native-diagnostic', 'shared');
  const session = await openMacosSyncGroupDesktopSession({ env: macosAcceptanceEnv(env),
    libraryHome: path.join(sharedRoot, 'macos-library'), repoRoot: paths.buildRoot,
    runtimeLogPath: path.join(root, 'desktop-runtime.log'),
    runtimeRoot: path.join(sharedRoot, 'macos-runtime') });
  try {
    const overview = await session.load();
    if (overview.sync_group?.group_id !== before.inspection.group.group_id
      || overview.server_status?.state !== 'running') throw new Error('S220 Mac group not ready.');
    receipt.anchor = await observeMacosAnchorAfterElection(session);
    receipt.macBefore = await readDesktop(session, fixture);
    const mobile = await runMacosA5SyncGroupMaintenance({ action: 'sync-now',
      appId: S220_APP_ID, buildIdentity, env, execute,
      evidenceRoot: path.join(root, 'a5-sync-now'),
      installMain: false, paths, serial, transportRequired: false });
    receipt.mobileRun = mobile.manifestPath;
    receipt.stage = 'mobile-sync-completed';
    save();
    receipt.macAfter = await readDesktop(session, fixture);
    const afterPath = await inspectS220A5Group({ assertFixed, paths, serial });
    const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
    receipt.a5After = { c: after.inspection.journeyFacts.find((node) => node.id === C_ID),
      item: after.inspection.review.find((node) => node.node_id === fixture.itemId),
      counts: after.counts, attachments: after.attachments };
    if (!receipt.macAfter.cBodyContainsMarker || receipt.macAfter.itemReview?.reps !== 1
      || receipt.macAfter.itemReview?.due !== item.due || receipt.macAfter.conflicts !== 0
      || receipt.a5After.c?.current_version_id !== c.current_version_id
      || receipt.a5After.item?.reps !== 1
      || receipt.a5After.counts.review_log !== reviewed.after.counts.review_log) {
      throw new Error('S220 Mac/A5 review or edited body did not converge.');
    }
    receipt.stage = 'converged';
    receipt.resultStatus = 'success';
    save();
    console.log(`[macos-a5-dev] S220 convergence=${receiptPath}`);
    return receipt;
  } catch (error) {
    receipt.error = String(error.message).slice(0, 500);
    save();
    throw error;
  } finally {
    await session.close();
  }
}
