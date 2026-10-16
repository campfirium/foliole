// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { wholeBodies } from '../database/topicTextState.testSupport.js';

import { readFixtureInventory }
  from './desktopFramedSyncPublicationRecovery.testSupport.js';
import {
  createDesktopFramedSyncTwoProcessFixture,
  type DesktopFramedSyncFixtureProcess,
  readDesktopFramedSyncLibraryEvidence
} from './desktopFramedSyncTwoProcess.testSupport.js';

let root = '';
const processes: DesktopFramedSyncFixtureProcess[] = [];

afterEach(async ({ task }) => {
  const active = processes.splice(0);
  await Promise.allSettled(active.map((process) => process.close()));
  if (!root) return;
  if (task.result?.state === 'fail') {
    const diagnostics = active.map((process, index) =>
      `Process ${index + 1}\n${process.diagnostics()}`).join('\n');
    await fs.writeFile(`${root}/version-chain-processes.log`, diagnostics);
    console.info('Failed framed-sync version-chain fixture:', root);
  } else {
    await fs.rm(root, { force: true, recursive: true });
  }
  root = '';
});

async function setup() {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  root = fixture.root;
  processes.push(fixture.left, fixture.right);
  return fixture;
}

it('persists a complete missing root-to-base-to-child chain through HTTP and restart',
async () => {
  const fixture = await setup();
  const nodeId = 't326-three-generation-chain';
  const edits: Array<readonly [string, string]> = [
    ['Root', 'Root body'],
    ['Base', 'Base body'],
    ['Child', 'Child body']
  ];
  for (const [title, content] of edits) {
    await fixture.left.seed({ content, nodeId, title });
  }
  expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath)).toMatchObject({
    parents: [expect.any(Object), expect.any(Object)],
    versions: [expect.any(Object), expect.any(Object), expect.any(Object)]
  });
  const source = readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath);
  const original = versionFacts(fixture.leftSnapshot.databasePath);
  expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath)).toMatchObject({
    nodes: [], parents: [], versions: []
  });

  await expect(fixture.left.synchronize(fixture.rightSnapshot.origin)).resolves.toEqual({ complete: true, attachmentProgress: 0, attachmentYielded: false });
  const received = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(received.nodes).toEqual([
    expect.objectContaining({ content: 'Child body', id: nodeId, title: 'Child' })
  ]);
  expect(received.versions).toHaveLength(3);
  expect(received.versions).toEqual(source.versions);
  expect(versionFacts(fixture.rightSnapshot.databasePath)).toEqual(original);
  expect(received.parents).toHaveLength(2);
  const byVersion = new Map(received.versions.map((version) => [
    (version as { version_id: string }).version_id,
    version
  ]));
  for (const edge of received.parents as { parent_version_id: string; version_id: string }[]) {
    expect(byVersion.has(edge.parent_version_id)).toBe(true);
    expect(byVersion.has(edge.version_id)).toBe(true);
  }
  expect(await readFixtureInventory(fixture.left)).toEqual(await readFixtureInventory(fixture.right));
  const restarted = await fixture.restartRight();
  processes.push(restarted.process);
  const reopened = readDesktopFramedSyncLibraryEvidence(restarted.snapshot.databasePath);
  expect(reopened.nodes).toEqual(received.nodes);
  expect(reopened.versions).toEqual(received.versions);
  expect(reopened.parents).toEqual(received.parents);
});

it('converges independent roots while retaining both original bodies and the complete alternative', async () => {
  const fixture = await setup();
  const nodeId = 't326-missing-common-base';
  await Promise.all([
    fixture.left.seed({ content: 'Left branch body', nodeId, title: 'Left branch' }),
    fixture.right.seed({ content: 'Right branch body', nodeId, title: 'Right branch' })
  ]);
  const beforeLeft = readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath);
  const beforeRight = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  const originalFacts = [...versionFacts(fixture.leftSnapshot.databasePath), ...versionFacts(fixture.rightSnapshot.databasePath)]
    .sort((a, b) => a.version_id.localeCompare(b.version_id));
  expect(beforeLeft.parents).toEqual([]);
  expect(beforeRight.parents).toEqual([]);
  expect((beforeLeft.nodes[0] as { current_version_id: string }).current_version_id)
    .not.toBe((beforeRight.nodes[0] as { current_version_id: string }).current_version_id);

  await expect(fixture.left.synchronize(fixture.rightSnapshot.origin)).resolves.toEqual({ complete: true, attachmentProgress: 0, attachmentYielded: false });
  const left = readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath);
  const right = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(left.nodes).toEqual(right.nodes);
  expect(left.versions).toEqual(right.versions);
  expect(versionFacts(fixture.leftSnapshot.databasePath).filter(row => originalFacts.some(original => original.version_id === row.version_id)))
    .toEqual(originalFacts);
  expect(left.versions).toHaveLength(3);
  expect(left.parents).toEqual(right.parents);
  expect(left.parents).toHaveLength(2);
  const originalIds = [...beforeLeft.versions, ...beforeRight.versions]
    .map(row => (row as { version_id: string }).version_id).sort();
  expect(left.parents.map(row => (row as { parent_version_id: string }).parent_version_id).sort()).toEqual(originalIds);
  expect(await readFixtureInventory(fixture.left)).toEqual(await readFixtureInventory(fixture.right));
  for (const snapshot of [fixture.leftSnapshot, fixture.rightSnapshot]) await assertWholeTexts(snapshot.databasePath, nodeId);
  const restartedLeft = await fixture.restartLeft();
  const restartedRight = await fixture.restartRight();
  processes.push(restartedLeft.process, restartedRight.process);
  for (const snapshot of [restartedLeft.snapshot, restartedRight.snapshot]) {
    const reopened = readDesktopFramedSyncLibraryEvidence(snapshot.databasePath);
    expect(reopened.nodes).toEqual(left.nodes);
    expect(reopened.versions).toEqual(left.versions);
    expect(reopened.parents).toEqual(left.parents);
    await assertWholeTexts(snapshot.databasePath, nodeId);
  }
});

async function assertWholeTexts(databasePath: string, nodeId: string) {
  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const record = await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(sqlite), nodeId);
    expect(record).not.toBeNull();
    expect(wholeBodies(record!)).toEqual(new Set(['Left branch body', 'Right branch body']));
    expect(record!.snapshot.text_alternatives).toHaveLength(1);
  } finally { sqlite.close(); }
}

function versionFacts(databasePath: string) {
  const db = new Database(databasePath, { readonly: true });
  try { return db.prepare<[], { version_id: string; object_id: string; content_hash: string; body_hash: string }>(
    `SELECT version_id, object_id, content_hash, json_extract(snapshot_json, '$.body_blob_hash') AS body_hash
      FROM node_sync_versions WHERE object_id LIKE 't326-%' ORDER BY version_id`).all(); }
  finally { db.close(); }
}
