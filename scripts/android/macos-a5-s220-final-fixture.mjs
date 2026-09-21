/* global console */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { macosAcceptanceEnv } from '../sync-group/multi-device-sync-macos-channel.mjs';
import { runMacosA5SyncGroupMaintenance } from '../sync-group/a5-sync-group-action.mjs';
import { observeMacosAnchorAfterElection } from './macos-a5-anchor-observation.mjs';
import { openMacosSyncGroupDesktopSession } from './macos-sync-group-desktop-session.mjs';
import { inspectS220A5Group } from './macos-a5-s220-group-inspect.mjs';
import { S220_APP_ID, inspectS220A5Packages } from './macos-a5-s220-package-inventory.mjs';

const TITLE = 'S220 final offline review fact';
const DUE = '2020-01-01T00:00:00.000Z';
const MARKER = 'S220 A5 final offline edit.';

export function readS220FinalFixture(paths) {
  const filePath = path.join(paths.artifactsRoot, 'S220', 'final-same-tip', 'fixture.json');
  const fixture = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (fixture.stage !== 'cached-on-a5' || !/^node-[0-9a-f-]{36}$/u.test(fixture.itemId)) {
    throw new Error('S220 final fixture has not reached its cached A5 checkpoint.');
  }
  return fixture;
}

export async function seedS220FinalFixture(args) {
  const { assertFixed, buildIdentity, env, execute, paths, serial } = args;
  const root = path.join(paths.artifactsRoot, 'S220', 'final-same-tip');
  const receiptPath = path.join(root, 'fixture.json');
  if (fs.existsSync(receiptPath)) throw new Error('S220 final fixture already attempted.');
  const inventory = await inspectS220A5Packages({ assertFixed, execute, paths, serial });
  if (!inventory.receipt.packages[S220_APP_ID].installed) throw new Error('S220 app missing.');
  const beforePath = await inspectS220A5Group({ assertFixed, paths, serial });
  const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
  if (!before.inspection.group?.group_id || before.inspection.members.length !== 3) {
    throw new Error('S220 three-member isolated group is absent.');
  }
  fs.mkdirSync(root, { recursive: true });
  const fixture = { appId: S220_APP_ID, groupId: before.inspection.group.group_id,
    itemId: `node-${randomUUID()}`, marker: MARKER, title: TITLE, stage: 'prepared' };
  const save = () => fs.writeFileSync(receiptPath, `${JSON.stringify(fixture, null, 2)}\n`);
  save();
  const sharedRoot = path.join(paths.artifactsRoot, 'S220', 'fri-native-diagnostic', 'shared');
  const session = await openMacosSyncGroupDesktopSession({ env: macosAcceptanceEnv(env),
    libraryHome: path.join(sharedRoot, 'macos-library'), repoRoot: paths.buildRoot,
    runtimeLogPath: path.join(root, 'fixture-desktop-runtime.log'),
    runtimeRoot: path.join(sharedRoot, 'macos-runtime') });
  try {
    const overview = await session.load();
    if (overview.sync_group?.group_id !== fixture.groupId
      || overview.server_status?.state !== 'running') throw new Error('S220 Mac group not ready.');
    fixture.anchor = await observeMacosAnchorAfterElection(session);
    const snapshot = await session.invoke('load_workspace_list_snapshot', {
      includePdfOpenings: false
    });
    const parent = Object.values(snapshot.nodesById).find((node) =>
      node.kind === 'topic' && node.title === 'Multi-device sync D fact');
    if (!parent || Object.values(snapshot.nodesById).some((node) => node.title === TITLE)) {
      throw new Error('S220 final FSRS parent or unique title precondition failed.');
    }
    const now = new Date().toISOString();
    await session.invoke('create_item', { nodeId: fixture.itemId, parentNodeId: parent.id,
      kind: 'item', title: TITLE, isTitleManual: true,
      content: 'What survives the final offline restart?',
      reveal: 'The new FSRS result and cached topic edit.', anchorLink: null,
      review: { due: DUE, lastReviewAt: null, state: 0, stability: 0, difficulty: 0,
        elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 },
      nodeOrder: [...snapshot.nodeOrder, fixture.itemId], position: snapshot.nodeOrder.length,
      createdAt: now, updatedAt: now });
    fixture.stage = 'created-on-mac';
    save();
    fixture.mobileRun = (await runMacosA5SyncGroupMaintenance({ action: 'sync-now',
      appId: S220_APP_ID, buildIdentity, env, execute,
      evidenceRoot: path.join(root, 'fixture-a5-sync-now'), installMain: false,
      paths, serial, transportRequired: false })).manifestPath;
    const afterPath = await inspectS220A5Group({ assertFixed, paths, serial });
    const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
    const item = after.inspection.reviewTargets.find((node) => node.id === fixture.itemId);
    const review = after.inspection.review.find((row) => row.node_id === fixture.itemId);
    if (item?.body_availability !== 'cached' || review?.reps !== 0 || review.due !== DUE) {
      throw new Error('S220 new FSRS item is not cached and due on A5.');
    }
    fixture.stage = 'cached-on-a5';
    save();
    console.log(`[macos-a5-dev] S220 final fixture=${receiptPath}`);
    return fixture;
  } catch (error) {
    fixture.error = String(error.message).slice(0, 500);
    save();
    throw error;
  } finally { await session.close(); }
}
