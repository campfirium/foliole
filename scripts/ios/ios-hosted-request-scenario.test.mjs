// @vitest-environment node
import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, app: {
  getPath(name) { if (!sandbox.root) throw new Error('fixture_not_initialized'); return path.join(sandbox.root, name); },
  isPackaged: false
} }));

import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionMaintenance, runWithDatabaseConnectionOwner } from '../../electron/database/connection.js';
import { clearCompanionRequestNonceCache } from '../../electron/sync/companionRequestAuth.js';
import { clearDesktopSyncGroupMemberStateReadiness } from '../../electron/sync/desktopSyncGroupMemberStateReadiness.js';
import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion.js';
import { buildWorkspaceSnapshotNode } from '../../lib/core/database/workspaceSnapshotHelpers.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.js';
import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState.js';
import { saveNodeReviewStateWithSync } from '../../lib/core/database/nodeReviewSyncState.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { applyReviewLogRecordsWithDbPort } from '../../lib/core/sync/syncReviewLogApply.js';
import { hostedAttachments, hostedContentBodies } from './ios-hosted-request-seed-data.ts';
import { scenarioFixture } from './ios-hosted-request-scenario.testSupport.mjs';

let fixture;
afterEach(async () => {
  await fixture?.close(); fixture = undefined;
  await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
  clearDesktopSyncGroupMemberStateReadiness(); clearCompanionRequestNonceCache(); vi.unstubAllEnvs();
  if (sandbox.root) fs.rmSync(sandbox.root, { recursive: true, force: true }); sandbox.root = '';
});
const version = suffix => `ver_00000000-0000-4000-8000-000000000${suffix}`;

it('roundtrips real request HTTP from 145 through phone 146/147 to provider 148 and repeats without new history', async () => {
  fs.mkdirSync('.tmp/artifacts', { recursive: true });
  sandbox.root = fs.mkdtempSync(path.resolve('.tmp/artifacts/hosted-scenario-http-'));
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(sandbox.root, 'provider'));
  fixture = await scenarioFixture(sandbox.root);
  await fixture.round();
  const initial = fixture.phone.prepare('SELECT * FROM node_sync_versions WHERE version_id=?').get(version('145'));
  expect(initial).toMatchObject({ object_id: 'ios-acceptance-restore', body_text: 'Restore body',
    content_hash: 'a1b42f78e5f0e1647ddeb0a537ae3b0a815dd55cacda702e9ebef1861b344cfa' });
  await writePhoneMutations(fixture);
  await fixture.round();
  await fixture.round();
  const read = sqlite => sqlite.prepare('SELECT version_id,object_id,parent_version_id,content_hash FROM node_sync_versions ORDER BY version_id').all();
  const before = read(fixture.phone);
  expect(before.filter(row => row.object_id !== 'special-inbox').map(row => row.version_id))
    .toEqual(['145', '146', '147', '148'].map(version));
  expect(before.filter(row => row.object_id === 'special-inbox')).toHaveLength(1);
  expect(before.find(row => row.version_id === version('148'))).toMatchObject({ object_id: 'phone-dynamic-capture', parent_version_id: version('146') });
  expect(fixture.phone.prepare('SELECT title,content,current_version_id FROM nodes WHERE id=?').get('phone-dynamic-capture'))
    .toEqual({ title: 'Mac successor acceptance', content: 'Mac successor body', current_version_id: version('148') });
  expect(fixture.phone.prepare("SELECT deleted_at FROM nodes WHERE id='ios-acceptance-restore'").get()).toEqual({ deleted_at: null });
  expect(fixture.observations).toMatchObject({ capture_node_id: 'phone-dynamic-capture',
    received_version_ids: [version('146'), version('147')], successor_version_id: version('148') });
  const providerBefore = await runWithDatabaseConnectionOwner(() => read(openDatabaseConnection().sqlite));
  await fixture.round();
  expect(read(fixture.phone)).toEqual(before);
  expect(await runWithDatabaseConnectionOwner(() => read(openDatabaseConnection().sqlite))).toEqual(providerBefore);
});

async function writePhoneMutations({ phone, db }) {
  const restored = buildWorkspaceSnapshotNode(phone.prepare("SELECT * FROM nodes WHERE id='ios-acceptance-restore'").get());
  const capture = await toWorkspaceNativeNodeVersion({ id: 'phone-dynamic-capture', parentNodeId: 'special-inbox', kind: 'topic',
    title: 'iOS quick capture acceptance', content: 'iOS quick capture acceptance', isTitleManual: false, hideTitleHeading: false,
    reveal: null, anchorLink: null, reading: null, review: null,
    createdAt: '2026-07-21T00:03:00.000Z', updatedAt: '2026-07-21T00:03:00.000Z'
  }, 'ios-acceptance-contract-peer', version('146'));
  const restore = await toWorkspaceNativeNodeVersion({ ...restored, deletedAt: null, updatedAt: '2026-07-21T00:03:30.000Z' },
    'ios-acceptance-contract-peer', version('147'));
  await applySyncNodesWithDbPort(db, [capture, restore]);
}

it('writes shared learning facts through state HTTP without transmitting phone settings or reading position', async () => {
  fs.mkdirSync('.tmp/artifacts', { recursive: true });
  sandbox.root = fs.mkdtempSync(path.resolve('.tmp/artifacts/hosted-state-http-'));
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(sandbox.root, 'provider'));
  const stateObservations = { persisted: null };
  fixture = await scenarioFixture(sandbox.root, { seed: 'stateInitial', stateObservations });
  await fixture.round();
  await writePhoneState(fixture);
  await fixture.round();
  const expected = {
    reading: { interval_duration_ms: 60000, interval_growth_factor: 1.5, last_handled_at: '2026-07-21T00:01:00.000Z',
      next_at: '2026-07-21T00:02:00.000Z', priority: 2, repetition_count: 3, state: 'active' },
    review: { difficulty: 5.2, due: '2026-07-28T00:01:00.000Z', elapsed_days: 3, lapses: 1,
      last_review_at: '2026-07-21T00:01:00.000Z', reps: 4, scheduled_days: 7, stability: 8.5, state: 2 },
    review_log: [{ op_id: 'phone-review-op', grade: 3, scheduler_version: 'fsrs-6', reviewed_at: '2026-07-21T00:01:00.000Z',
      due_before: '2026-07-21T00:01:00.000Z', stability_before: 4.2, difficulty_before: 6.1,
      due_after: '2026-07-28T00:01:00.000Z', stability_after: 8.5, difficulty_after: 5.2 }],
    phone_private_setting_count: 0
  };
  expect(stateObservations.persisted).toEqual(expected);
  const phonePrivate = () => ({
    position: fixture.phone.prepare("SELECT reading_position FROM node_reading_host_state WHERE node_id='ios-state-node'").all(),
    setting: fixture.phone.prepare("SELECT value_json FROM setting_records WHERE key='handoff_reminder_settings'").all()
  });
  const localBefore = phonePrivate();
  expect(localBefore).toEqual({ position: [{ reading_position: 42 }], setting: [{ value_json: '{"enabled":true}' }] });
  await runWithDatabaseConnectionOwner(() => {
    const sqlite = openDatabaseConnection().sqlite;
    expect(sqlite.prepare('SELECT * FROM node_reading_host_state').all()).toEqual([]);
    expect(sqlite.prepare("SELECT * FROM setting_records WHERE scope='host'").all()).toEqual([]);
  });
  await fixture.round();
  expect(stateObservations.persisted).toEqual(expected);
  expect(phonePrivate()).toEqual(localBefore);
  expect(fixture.phone.prepare('SELECT count(*) AS count FROM review_log').get().count).toBe(1);
});

async function writePhoneState({ phone, db }) {
  const driver = createBetterSqlite3Driver(phone), updatedAt = '2026-07-21T00:01:00.000Z';
  saveNodeReadingStateWithSync(driver, { nodeId: 'ios-state-node', hostName: 'Phone', updatedAt, reading: {
    intervalDurationMs: 60000, intervalGrowthFactor: 1.5, lastHandledAt: updatedAt, nextAt: '2026-07-21T00:02:00.000Z',
    priority: 2, readingPosition: 42, repetitionCount: 3, state: 'active'
  } });
  saveNodeReviewStateWithSync(driver, { nodeId: 'ios-state-node', hostName: 'Phone', updatedAt, review: {
    difficulty: 5.2, due: '2026-07-28T00:01:00.000Z', elapsedDays: 3, lapses: 1, lastReviewAt: updatedAt,
    reps: 4, scheduledDays: 7, stability: 8.5, state: 2
  } });
  await applyReviewLogRecordsWithDbPort(db, [{ id: 'phone-review-id', op_id: 'phone-review-op', host_name: 'Phone',
    node_id: 'ios-state-node', grade: 3, scheduler_version: 'fsrs-6', reviewed_at: updatedAt,
    due_before: updatedAt, stability_before: 4.2, difficulty_before: 6.1,
    due_after: '2026-07-28T00:01:00.000Z', stability_after: 8.5, difficulty_after: 5.2
  }], { requireExistingNode: true });
  const privateSetting = { scope: 'host', platform: 'ios', form_factor: 'phone', host_name: 'Phone',
    key: 'handoff_reminder_settings', value_json: '{"enabled":true}' };
  await db.transaction(tx => applySyncObjectInTransaction(tx, {
    object_type: 'setting', object_id: 'host:ios:phone:Phone:handoff_reminder_settings', deleted_at: null,
    updated_at: updatedAt, content_hash: computeSyncContentHash('setting', privateSetting), payload_json: JSON.stringify(privateSetting)
  }, { hostName: 'Phone' }));
}

it('downloads complete content objects and four references over HTTP without pending database work', async () => {
  fs.mkdirSync('.tmp/artifacts', { recursive: true });
  sandbox.root = fs.mkdtempSync(path.resolve('.tmp/artifacts/hosted-content-http-'));
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(sandbox.root, 'provider'));
  fixture = await scenarioFixture(sandbox.root, { seed: 'contentResource' });
  expect(await fixture.round()).toMatchObject({ complete: true, pending: 0 });
  for (const name of ['topic', 'missing', 'corrupt']) {
    expect(fixture.phone.prepare('SELECT content FROM nodes WHERE id=?').get(`ios-content-${name}`).content)
      .toBe(hostedContentBodies[name].text);
  }
  expect(fixture.phone.prepare("SELECT content FROM external_documents WHERE document_id='ios-external:orchid.md'").get().content)
    .toBe(hostedContentBodies.external.text);
  const refs = JSON.parse(fixture.phone.prepare("SELECT resource_references FROM nodes WHERE id='ios-content-topic'").get().resource_references);
  expect(refs.map(ref => ref.storage_key).sort()).toEqual(Object.entries(hostedAttachments)
    .map(([name, resource]) => `${resource.hash}.${name === 'valid' ? 'pdf' : 'png'}`).sort());
  const resources = await fixture.attachments();
  expect(fixture.phone.prepare('SELECT text FROM pdf_page_text WHERE attachment_id=?').get(hostedAttachments.valid.hash).text)
    .toBe('Extracted pdf-cobalt-token');

  const bytes = fs.readFileSync(path.join(resources.assetsDir, `${hostedAttachments.valid.hash}.pdf`));
  expect(bytes).toEqual(Buffer.from(hostedAttachments.valid.base64, 'base64'));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(hostedAttachments.valid.hash);
  for (const name of ['corrupt', 'missing', 'failed']) {
    expect(fs.existsSync(path.join(resources.assetsDir, `${hostedAttachments[name].hash}.png`))).toBe(false);
    expect(resources.failures.some(failure => failure.key === `${hostedAttachments[name].hash}.png`)).toBe(true);
  }
  expect(await fixture.round()).toMatchObject({ complete: true, pending: 0 });
  expect(fixture.phone.prepare("SELECT count(*) AS count FROM node_sync_versions WHERE object_id LIKE 'ios-content-%'").get().count).toBe(3);
});
