// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { readDesktopFramedSyncLibraryEvidence } from '../../../../../../electron/sync/desktopFramedSyncTwoProcess.testSupport.js';
import { beginSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { createCompanionRequestFixture, native } from '../../../../../test/companionRequestSync.testSupport.js';

vi.mock('@capacitor/core', async original => {
  const actual = await original<typeof import('@capacitor/core')>();
  return { ...actual, Capacitor: { ...actual.Capacitor, getPlatform: () => 'android' } };
});
vi.mock('../../../companionBootstrap.js', async original => ({
  ...await original<typeof import('../../../companionBootstrap.js')>(), isNativeCompanionRuntime: () => true
}));

const NODES = 150;
let host: Awaited<ReturnType<typeof createCompanionRequestFixture>> | undefined;
afterEach(async () => {
  native.active = true;
  [native.beginBackground, native.updateBackground, native.endBackground].forEach(mock => mock.mockClear());
  await host?.close();
  host = undefined;
});

async function prepareLargeAdoption() {
  host = await createCompanionRequestFixture();
  const { fixture } = host;
  await fixture.right.invoke('seed_complete_inventory', { count: NODES, bodyBytes: 400 });
  await beginSyncGroupLocalAdoption(host.db, { endpointUrl: fixture.rightSnapshot.origin,
    groupId: 't326-group', libraryEpoch: `${fixture.leftSnapshot.deviceId}-epoch`,
    providerDeviceId: fixture.rightSnapshot.deviceId, providerDeviceName: 'Provider', providerPlatform: 'darwin' });
  return host;
}

function leaveScreen() {
  native.active = false;
  [...native.leftScreen].forEach(listener => listener());
}

const receivedNodes = (adoption: NonNullable<typeof host>) => readDesktopFramedSyncLibraryEvidence(
  adoption.fixture.leftSnapshot.databasePath).nodes.filter(node => (node as { id: string }).id.startsWith('t326-complete-'));

it('keeps receiving a large round after the phone leaves the screen', { meta: { calibratedMs: 30000 } }, async () => {
  const adoption = await prepareLargeAdoption();
  let left = false;
  await adoption.sync({ onProgress: progress => {
    if (left || progress.phase !== 'structure' || !progress.completed) return;
    left = true;
    leaveScreen();
  } });
  expect(left).toBe(true);
  expect(native.beginBackground).toHaveBeenCalledOnce();
  expect(native.updateBackground).toHaveBeenCalled();
  expect(native.endBackground).toHaveBeenCalledOnce();
  expect(await loadSyncGroupLocalAdoption(adoption.db)).toBeNull();
  expect(receivedNodes(adoption)).toHaveLength(NODES);
});

it('stops the round off screen once Android ends the background work', { meta: { calibratedMs: 30000 } }, async () => {
  const adoption = await prepareLargeAdoption();
  let ended = false;
  await expect(adoption.sync({ onProgress: progress => {
    if (ended || progress.phase !== 'structure' || !progress.completed) return;
    ended = true;
    leaveScreen();
    [...native.backgroundEnded].forEach(listener => listener());
  } })).rejects.toThrow('request_sync_foreground_ended');
  expect(await loadSyncGroupLocalAdoption(adoption.db)).not.toBeNull();
  expect(receivedNodes(adoption).length).toBeLessThan(NODES);
});
