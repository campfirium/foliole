// @vitest-environment node
import Database from 'better-sqlite3';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.js';
import { textBranch } from '../../electron/database/topicTextState.testSupport.js';
import { loadSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { createJoiningMobile, mobile } from '../test/companionJoinedMobile.testSupport.js';

const { LocalizationProvider } = await import('../shared/localization/LocalizationProvider');
const { readCompanionSyncGroupAdoptionRun, runPendingCompanionSyncGroupAdoption } =
  await import('../shared/platform/companion/sync/companionSyncGroupAdoptionRun');
const { completeCompanionSyncGroupJoin, requestCompanionSyncGroupJoin } =
  await import('../shared/platform/companionSyncGroupJoinClient');
const { ReceivingGroupDataState } = await import('./CompanionSyncSetupStates');

let host: Awaited<ReturnType<typeof createJoiningMobile>> | undefined;
afterEach(async () => { await host?.close(); host = undefined; });

function renderCard() {
  const run = readCompanionSyncGroupAdoptionRun();
  return run.phase === 'none' ? '' : renderToStaticMarkup(
    <LocalizationProvider initialLanguagePreference="en">
      <ReceivingGroupDataState run={run} onLeave={vi.fn()} onRetry={vi.fn()} />
    </LocalizationProvider>
  );
}

async function approveJoin(provider: Awaited<ReturnType<typeof createJoiningMobile>>) {
  const args = { databasePath: provider.local.database, endpointUrl: provider.peer.origin,
    groupId: provider.groupId, mode: 'use-group' as const };
  const pending = await requestCompanionSyncGroupJoin(args);
  await provider.provider.send('joinAccept', { requestId: pending.request_id });
  return () => completeCompanionSyncGroupJoin({ ...args, providerDeviceId: provider.peer.identity,
    providerDeviceName: 'Provider Mac', providerPlatform: 'darwin', requestId: pending.request_id });
}

it('keeps received objects and shows the Mac preparation failure until the same reception completes', {
  meta: { calibratedMs: 20000 }
}, async () => {
  host = await createJoiningMobile();
  const { provider, db } = host;
  await provider.send('batch', { nodes: [{ id: 'a', content: 'Alpha' }, { id: 'c', content: 'Charlie' }] });
  const source = new Database(host.peer.database);
  const oversized = textBranch('b-v1', 'x'.repeat(1_048_577));
  try {
    await applyConvergentSyncNodesWithDbPort(createBetterSqliteDbPort(source),
      [{ ...oversized, object_id: 'b', snapshot: { ...oversized.snapshot, id: 'b' } }]);
  } finally {
    source.close();
  }
  const join = await approveJoin(host);
  expect(renderCard()).toBe('');

  await join();
  expect(await db.query("SELECT id FROM nodes WHERE id IN ('a','b','c') ORDER BY id")).toEqual([{ id: 'a' }, { id: 'c' }]);
  expect(await loadSyncGroupLocalAdoption(db)).not.toBeNull();
  expect(readCompanionSyncGroupAdoptionRun()).toMatchObject({ phase: 'receiving' });
  expect(renderCard()).toMatch(/Received [1-9]\d* of \d+/u);
  expect(renderCard()).toContain('Provider Mac · Preparing to send');
  expect(renderCard()).toContain('request_sync_body_too_large</code>');
  expect(renderCard()).toContain('Continue after shortening the body');
  expect(renderCard()).not.toContain('Try again');

  await provider.send('seed', { id: 'b', content: 'Repaired body' });
  await expect(runPendingCompanionSyncGroupAdoption()).resolves.toBe(true);
  expect(await loadSyncGroupLocalAdoption(db)).toBeNull();
  expect(await db.query("SELECT id FROM nodes WHERE id IN ('a','b','c') ORDER BY id"))
    .toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  expect(renderCard()).toBe('');
});

it('shows a safe code for a session failure and completes normally when the provider is reachable', {
  meta: { calibratedMs: 20000 }
}, async () => {
  host = await createJoiningMobile();
  const { db } = host;
  const join = await approveJoin(host);
  const privateDetail = 'https://user:secret@host/private/library';
  const send = mobile.http.getMockImplementation()!;
  mobile.http.mockImplementation(async request => {
    if (request.url.endsWith('/sync-group/member-state')) throw new Error(privateDetail);
    return send(request);
  });
  await expect(join()).rejects.toThrow(privateDetail);
  mobile.http.mockImplementation(send);
  expect(renderCard()).toContain('sync_receive_failed</code>');
  expect(renderCard()).toContain('Unknown device · Unknown stage');
  expect(renderCard()).not.toMatch(/secret|private\/library|Provider Mac/u);
  expect(await loadSyncGroupLocalAdoption(db)).not.toBeNull();

  await expect(runPendingCompanionSyncGroupAdoption()).resolves.toBe(true);
  expect(await loadSyncGroupLocalAdoption(db)).toBeNull();
  expect(renderCard()).toBe('');
});
