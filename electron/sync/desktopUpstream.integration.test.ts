// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { buildDesktopFramedSyncFixture, createDesktopFramedSyncTwoProcessFixture,
  type DesktopFramedSyncFixtureProcess } from './desktopFramedSyncTwoProcess.testSupport.js';

let buildRoot: string;
let script: string;
beforeAll(async () => {
  buildRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-upstream-build-'));
  script = path.join(buildRoot, 'fixture.mjs');
  await buildDesktopFramedSyncFixture(script, true);
});
afterAll(async () => { if (buildRoot) await fs.rm(buildRoot, { recursive: true, force: true }); });

type Desktop = { process: DesktopFramedSyncFixtureProcess; databasePath: string; deviceId: string; origin: string };

/** Starts linked desktops ranked from the highest device ID (the root) downward. */
// Two-desktop runs only read the first two entries.
type Ranked = [Desktop, Desktop, Desktop];

async function withDesktops(count: 2 | 3, run: (ranked: Ranked) => Promise<void>) {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(script, true, true);
  const third = count === 3 ? await fixture.startThird() : null;
  const desktops: Desktop[] = [{ process: fixture.left, ...fixture.leftSnapshot }, { process: fixture.right, ...fixture.rightSnapshot },
    ...(third ? [{ process: third.process, ...third.snapshot }] : [])];
  try {
    for (const desktop of desktops) {
      for (const node of ['node-0', 'node-1', 'node-2']) await desktop.process.seed({ nodeId: node, title: node, content: 'Initial' });
      await desktop.process.invoke('activation_start');
    }
    for (const desktop of desktops) {
      for (const peer of desktops) if (peer !== desktop) await desktop.process.invoke('activation_found', { origin: peer.origin });
    }
    await run([...desktops].sort((a, b) => (a.deviceId < b.deviceId ? 1 : -1)) as Ranked);
  } finally {
    await Promise.allSettled(desktops.map(desktop => desktop.process.close()));
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
}

function query(desktop: Desktop, sql: string, ...args: unknown[]) {
  const db = new Database(desktop.databasePath, { readonly: true, fileMustExist: true });
  try { return db.prepare(sql).pluck().get(...args); } finally { db.close(); }
}

function edit(desktop: Desktop, nodeId: string, content: string) {
  return desktop.process.invoke('local_content_edit', { nodeId, content, hostName: desktop.deviceId,
    baseVersionId: query(desktop, 'SELECT current_version_id FROM nodes WHERE id = ?', nodeId),
    versionId: `${nodeId}-${content.replaceAll(' ', '-')}`, updatedAt: new Date().toISOString() });
}

function activity(desktop: Desktop) {
  const value = query(desktop, "SELECT value FROM settings WHERE key = 'sync_group_activity'") as string | undefined;
  return value ? JSON.parse(value) as { run_id: string; peer_device_id: string | null; message: string }[] : [];
}

const runsToward = (desktop: Desktop, peer: Desktop) =>
  new Set(activity(desktop).filter(event => event.peer_device_id === peer.deviceId).map(event => event.run_id));
const sawBusy = (desktop: Desktop) => activity(desktop).some(event => event.message.includes('busy'));
const converge = (desktop: Desktop, nodeId: string, value: string) => expect.poll(
  () => query(desktop, 'SELECT content FROM nodes WHERE id = ?', nodeId), { timeout: 15_000, interval: 50 }).toBe(value);

it('lets the lower desktop schedule the pair while both sides edit at once', { meta: { calibratedMs: 90_000 } }, async () => {
  await withDesktops(2, async ([root, client]) => {
    const before = runsToward(root, client);
    await Promise.all([edit(root, 'node-0', 'Root edit'), edit(client, 'node-1', 'Client edit')]);
    await converge(client, 'node-0', 'Root edit');
    await converge(root, 'node-1', 'Client edit');
    await edit(root, 'node-0', 'Root edit again');
    await converge(client, 'node-0', 'Root edit again');
    expect([...runsToward(root, client)].filter(run => !before.has(run))).toEqual([]);
    expect(sawBusy(root) || sawBusy(client)).toBe(false);
  });
});

it('forms one star across three desktops and relays leaf edits through the root', { meta: { calibratedMs: 120_000 } }, async () => {
  await withDesktops(3, async ([root, leafA, leafB]) => {
    const rootRuns = new Set([...runsToward(root, leafA), ...runsToward(root, leafB)]);
    const leafRuns = new Set([...runsToward(leafA, leafB), ...runsToward(leafB, leafA)]);
    await Promise.all([edit(leafA, 'node-1', 'Leaf A edit'), edit(leafB, 'node-2', 'Leaf B edit'), edit(root, 'node-0', 'Root edit')]);
    for (const desktop of [root, leafA, leafB]) {
      await converge(desktop, 'node-0', 'Root edit');
      await converge(desktop, 'node-1', 'Leaf A edit');
      await converge(desktop, 'node-2', 'Leaf B edit');
    }
    expect([...runsToward(root, leafA), ...runsToward(root, leafB)].filter(run => !rootRuns.has(run))).toEqual([]);
    expect([...runsToward(leafA, leafB), ...runsToward(leafB, leafA)].filter(run => !leafRuns.has(run))).toEqual([]);
    expect([root, leafA, leafB].some(sawBusy)).toBe(false);
  });
});

it('moves to the next desktop when the root goes away', { meta: { calibratedMs: 120_000 } }, async () => {
  await withDesktops(3, async ([root, leafA, leafB]) => {
    await root.process.close();
    await edit(leafB, 'node-2', 'After root left');
    await converge(leafA, 'node-2', 'After root left');
    await edit(leafA, 'node-1', 'Answer without root');
    await converge(leafB, 'node-1', 'Answer without root');
  });
});

const sessions = (desktop: Desktop) => desktop.process.invoke('activation_peer_sessions');
const showsForeground = async (desktop: Desktop) =>
  ((await (await fetch(`${desktop.origin}/companion/discovery`)).json()) as { foreground?: boolean }).foreground === true;

it('moves the root to the desktop the user settles on and back when it locks', { meta: { calibratedMs: 120_000 } }, async () => {
  await withDesktops(2, async ([byId, other]) => {
    await expect.poll(async () => [await sessions(byId), await sessions(other)], { timeout: 10_000 }).toEqual([[], [byId.deviceId]]);
    await other.process.invoke('activation_foreground', { foreground: true });
    await expect.poll(async () => [await sessions(byId), await sessions(other)], { timeout: 15_000 }).toEqual([[other.deviceId], []]);
    const before = runsToward(other, byId);
    await Promise.all([edit(byId, 'node-0', 'While other leads'), edit(other, 'node-1', 'Leader edit')]);
    await converge(other, 'node-0', 'While other leads');
    await converge(byId, 'node-1', 'Leader edit');
    expect([...runsToward(other, byId)].filter(run => !before.has(run))).toEqual([]);

    await other.process.invoke('activation_foreground', { foreground: false });
    await expect.poll(async () => [await sessions(byId), await sessions(other)], { timeout: 30_000 }).toEqual([[], [byId.deviceId]]);
  });
});

it('hands the root to the desktop the user settled on last while the idle earlier one keeps its window focused', { meta: { calibratedMs: 120_000 } }, async () => {
  await withDesktops(2, async ([earlier, later]) => {
    await earlier.process.invoke('activation_foreground', { foreground: true });
    await expect.poll(() => showsForeground(earlier), { timeout: 10_000 }).toBe(true);
    await earlier.process.invoke('activation_foreground', { foreground: true, idleSeconds: 60 });
    await expect.poll(async () => [await sessions(earlier), await sessions(later)], { timeout: 10_000 }).toEqual([[], [earlier.deviceId]]);
    await later.process.invoke('activation_foreground', { foreground: true });
    await expect.poll(async () => [await sessions(earlier), await sessions(later)], { timeout: 30_000 }).toEqual([[later.deviceId], []]);
    expect(await showsForeground(earlier)).toBe(false);
    await edit(earlier, 'node-0', 'Through the later root');
    await converge(later, 'node-0', 'Through the later root');
  });
});

it('gathers every desktop under the lowest-ranked desktop once it takes the foreground', { meta: { calibratedMs: 120_000 } }, async () => {
  await withDesktops(3, async ([root, middle, lowest]) => {
    await lowest.process.invoke('activation_foreground', { foreground: true });
    await expect.poll(async () => [await sessions(root), await sessions(middle), await sessions(lowest)], { timeout: 30_000 })
      .toEqual([[lowest.deviceId], [lowest.deviceId], []]);
    await edit(root, 'node-0', 'Through the new root');
    await converge(middle, 'node-0', 'Through the new root');
  });
});
