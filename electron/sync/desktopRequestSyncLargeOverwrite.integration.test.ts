// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { z } from 'zod';

import { largeOverwriteState, verifyLargeOverwriteAttachments,
  verifyLargeOverwriteBodies } from './desktopFramedSyncLargeOverwrite.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';
import { continueAfterObjectCommitFailure, installObjectCommitFailure, overwriteProgressRow,
  preservedRestoreArticle, restoreIdentityState } from './desktopFramedSyncVerifiedRestoreTwoProcess.testSupport.js';

it.each(['restore', 'adoption'] as const)(
  'resumes production request %s of 1000 nodes after object 400 and a process restart', async mode => {
    const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
    const started = performance.now();
    let passed = false;
    try {
      const { workload, source, request } = await prepare(fixture, mode);
      const transferStarted = performance.now();
      installObjectCommitFailure(fixture.rightSnapshot.databasePath, 400);
      await expect(fixture.right.invoke('round', request)).rejects.toThrow('identity_restore_object_rejected');
      const failed = largeOverwriteState(fixture.rightSnapshot.databasePath);
      expect(failed.nodes).toHaveLength(400); expect(failed.versions).toHaveLength(1200);
      expect(failed.receipts).toEqual([]);
      const progress = overwriteProgressRow(fixture.rightSnapshot.databasePath);
      expect(progress).toBeDefined();
      const identity = restoreIdentityState(fixture.rightSnapshot.databasePath);
      if (mode === 'restore') expect(await preservedRestoreArticle(
        path.join(fixture.rightSnapshot.stateRoot, 'identity-restore-backups'), fixture.root, 'old-large-library'))
        .toMatchObject({ content: 'Old library body' });
      const first = failed.nodes[0];
      if (!first) throw new Error('large_overwrite_completed_object_missing');
      const restarted = await fixture.restartRight();
      expect(restarted.snapshot.pid).not.toBe(fixture.rightSnapshot.pid);
      expect(largeOverwriteState(restarted.snapshot.databasePath)).toEqual(failed);
      expect(overwriteProgressRow(restarted.snapshot.databasePath)).toEqual(progress);
      expect(restoreIdentityState(restarted.snapshot.databasePath)).toEqual(identity);
      continueAfterObjectCommitFailure(restarted.snapshot.databasePath, first.id);
      expect(await fixture.right.invoke('round', request)).toMatchObject({ complete: true });
      const transferMs = performance.now() - transferStarted;
      const completed = await verifyLargeOverwriteBodies(restarted.snapshot.databasePath);
      expect(completed.nodes).toEqual(source.nodes); expect(completed.versions).toEqual(source.versions);
      expect(completed.nodes.slice(0, 400)).toEqual(failed.nodes);
      expect(completed.versions.slice(0, 1200)).toEqual(failed.versions);
      await verifyLargeOverwriteAttachments(restarted.snapshot.stateRoot);
      expect(overwriteProgressRow(restarted.snapshot.databasePath)).toBeUndefined();
      assertFinished(restarted.snapshot.databasePath, restarted.snapshot.deviceId, mode);
      const requests = z.record(z.string(), z.number()).parse(await fixture.left.invoke('request_counts'));
      const requestCount = Object.values(requests).reduce((sum, count) => sum + count, 0);
      expect(requests.pulls).toBeGreaterThan(0);
      expect(requestCount).toBeLessThan(1000);
      process.stderr.write(`${JSON.stringify({ event: 'request_sync_large_overwrite', platform: process.platform,
        mode, workload, transferMs, elapsedMs: performance.now() - started, requests, requestCount })}\n`);
      passed = true;
    } finally {
      await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
      if (passed) await fs.rm(fixture.root, { recursive: true, force: true });
      else console.info('Request large overwrite fixture:', fixture.root);
    }
  }, 600_000);

async function prepare(fixture: Awaited<ReturnType<typeof createDesktopFramedSyncTwoProcessFixture>>,
  mode: 'restore' | 'adoption') {
  const workload = await fixture.left.invoke('seed_large_overwrite');
  await fixture.right.seed({ nodeId: 'old-large-library', title: 'Old library', content: 'Old library body' });
  const source = await verifyLargeOverwriteBodies(fixture.leftSnapshot.databasePath);
  const args = { mode, peerOrigin: fixture.leftSnapshot.origin,
    peerDeviceId: fixture.leftSnapshot.deviceId, restoreId: 'request-large-restore' };
  if (mode === 'restore') await fixture.left.invoke('publish_identity_restore', {
    ...args, peerOrigin: fixture.rightSnapshot.origin, peerDeviceId: fixture.rightSnapshot.deviceId
  });
  await fixture.right.invoke('begin_identity_restore', args);
  const request = { input: { kind: 'request_reconcile', peerOrigin: fixture.leftSnapshot.origin,
    peer: { deviceId: fixture.leftSnapshot.deviceId, libraryEpoch: `${fixture.leftSnapshot.deviceId}-epoch` } } };
  return { workload, source, request };
}

function assertFinished(file: string, deviceId: string, mode: 'restore' | 'adoption') {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    expect(db.prepare("SELECT count(*) FROM nodes WHERE id = 'old-large-library'").pluck().get()).toBe(0);
    expect(db.prepare('SELECT count(*) FROM node_version_member_positions WHERE device_identity_key = ?')
      .pluck().get(deviceId)).toBe(1000);
    for (const table of ['framed_sync_inbound_transfers', 'framed_sync_receipts'])
      expect(db.prepare(`SELECT count(*) FROM ${table}`).pluck().get()).toBe(0);
    const state = restoreIdentityState(file);
    if (mode === 'restore') expect(state.restores).toEqual(expect.arrayContaining([
      expect.objectContaining({ restore_id: 'request-large-restore', applied_at: expect.any(String) })]));
    else expect(state.metadata).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'sync_group_completed_adoption' })]));
  } finally { db.close(); }
}
