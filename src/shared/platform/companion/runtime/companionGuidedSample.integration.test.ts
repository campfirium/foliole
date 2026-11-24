// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../../../../../lib/core/database/specialNodeIds';
import { getMobileGuidedSampleContent } from '../../../../../lib/core/guidedSample/guidedSampleContent';
import { refreshCompanionWorkspaceSnapshot } from '../companionWorkspaceSnapshotRefresh';
import { createDisplayLibrary } from '../sync/workspace-state/companionDisplaySnapshotConcurrency.testSupport';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';
import { openCompanionDailyFlowForDisplay } from './companionDailyFlowDisplay';

const runtime = vi.hoisted(() => ({ owner: null as CapacitorCompanionDatabaseOwner | null }));
vi.mock('./iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => runtime.owner! }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: () => ({})
}));
vi.mock('../../../localization/appLanguage', async importOriginal => ({
  ...await importOriginal<typeof import('../../../localization/appLanguage')>(),
  getStoredAppLocale: () => 'zh-Hans'
}));

const now = '2026-11-24T08:00:00.000Z';
let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  vi.useRealTimers();
  await close?.();
  close = null;
  runtime.owner = null;
});

async function openLibrary(platform: 'android' | 'ios') {
  const library = createDisplayLibrary(platform);
  runtime.owner = library.owner;
  close = library.close;
  await library.owner.open({ expectedHostName: 'guided-sample-fixture', now });
  return library.owner;
}

function userNodes(owner: CapacitorCompanionDatabaseOwner) {
  return owner.read(db => db.query<{ id: string; parent_id: string; priority: number; title: string; content: string }>(
    `SELECT id, parent_id, priority, title, content FROM nodes WHERE id NOT LIKE 'special-%' ORDER BY created_at`));
}

it.each(['android', 'ios'] as const)('%s opens Flow on the phone guided sample in an untouched library', async platform => {
  const owner = await openLibrary(platform);
  const flow = await openCompanionDailyFlowForDisplay({ now, mode: 'recommended' });

  const nodes = await userNodes(owner);
  const sample = getMobileGuidedSampleContent('zh-Hans');
  expect(nodes.map(node => node.title)).toEqual([sample.root, ...sample.children].map(topic => topic.title));
  expect(nodes[0]).toMatchObject({ parent_id: INBOX_NODE_ID, priority: 0 });
  expect(nodes.slice(1).every(node => node.parent_id === nodes[0]!.id && node.priority === 0)).toBe(true);
  expect(nodes.map(node => node.content).join('\n')).not.toMatch(/Alt \+|Option \+|按 \d/);
  // Flow starts on the sample root and queues the whole sample in its own order.
  expect(flow.session.currentNodeId).toBe(nodes[0]!.id);
  expect(flow.session.totalNodeCount).toBe(nodes.length);
  const order = await owner.read(db => db.query<{ node_id: string }>('SELECT node_id FROM daily_flow_entries ORDER BY order_key'));
  expect(order.map(row => row.node_id)).toEqual(nodes.map(node => node.id));
  // The sample is written as ordinary local versions, so it syncs like any other topic.
  const versions = await owner.read(db => db.query<{ count: number }>(
    `SELECT count(*) AS count FROM node_sync_versions WHERE object_id IN (${nodes.map(() => '?').join(',')})`,
    nodes.map(node => node.id)));
  expect(versions[0]!.count).toBe(nodes.length);
  const snapshot = await refreshCompanionWorkspaceSnapshot({ kind: 'full' });
  expect(snapshot!.nodesById[nodes[0]!.id]).toMatchObject({ title: sample.root.title, parentNodeId: INBOX_NODE_ID });

  await openCompanionDailyFlowForDisplay({ now, mode: 'recommended' });
  expect(await userNodes(owner)).toHaveLength(nodes.length);
});

it('stamps the sample no later than the time Flow opens at, so that open holds all of it', async () => {
  // Writing the sample takes time: by the time it lands, the clock is past the time the open was asked for.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.parse(now) + 60_000));
  const owner = await openLibrary('android');
  const flow = await openCompanionDailyFlowForDisplay({ now, mode: 'recommended' });
  const nodes = await userNodes(owner);
  expect(nodes).toHaveLength(1 + getMobileGuidedSampleContent('zh-Hans').children.length);
  expect(flow.session.currentNodeId).toBe(nodes[0]!.id);
  expect(flow.session.cycle).toMatchObject({ clearedAt: null, remaining: nodes.length });
});

it('leaves a library that already holds the user’s own material untouched', async () => {
  const owner = await openLibrary('android');
  await owner.runWriter(db => db.run(`INSERT INTO nodes (id,parent_id,kind,title,content,created_at,updated_at)
    VALUES ('mine',?,'topic','Mine','My own notes',?,?)`, [INBOX_NODE_ID, now, now]), { kind: 'business' });
  const flow = await openCompanionDailyFlowForDisplay({ now, mode: 'recommended' });
  expect((await userNodes(owner)).map(node => node.id)).toEqual(['mine']);
  expect(flow.session.currentNodeId).toBe('mine');
});

it('never writes the sample into a phone that has joined a sync group', async () => {
  const owner = await openLibrary('ios');
  await owner.runWriter(async db => {
    await db.run(`INSERT INTO sync_groups (group_id,display_name,workgroup_key,created_at,updated_at)
      VALUES ('group','Home','key',?,?)`, [now, now]);
    await db.run(`INSERT INTO sync_group_local_state (singleton_id,group_id,local_device_identity_key,state,updated_at)
      VALUES (1,'group','device','active',?)`, [now]);
  }, { kind: 'business' });
  await openCompanionDailyFlowForDisplay({ now, mode: 'recommended' });
  expect(await userNodes(owner)).toEqual([]);
});
