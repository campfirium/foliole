// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const javaRoot = path.join(root, 'android/app/src/main/java/com/foliole/android');
const readJava = (name) => readFile(path.join(javaRoot, name), 'utf8');

it('serves one active Group/Device provider surface on the stable LAN port', async () => {
  const server = await readJava('FolioleCompanionSyncGroupServer.java');
  expect(server).toContain('private static final int SYNC_PORT = 38641;');
  for (const route of [
    '/companion/discovery', '/sync-group/join-requests', '/sync-group/join-acceptance',
    '/companion/sync-pack', '/companion/content-blobs', '/companion/content-blob',
    '/companion/attachment-resource'
  ]) expect(server).toContain(`path.equals("${route}")`);
  expect(server).not.toMatch(/pairing|member|authorization_id|timeline_id/iu);
});

it('authenticates provider reads with the group key and an active Device fact', async () => {
  const auth = await readJava('FolioleCompanionSyncGroupRequestAuth.java');
  expect(auth).toContain('FolioleCompanionCurrentGroupCredential.load(');
  expect(auth).toContain('bridge.request("verify_device"');
  expect(auth).toContain('sync_group_device_not_active');
  expect(auth).toContain('replayed_nonce');
  expect(auth).not.toMatch(/Pairing|Member|authorization_id/u);
});

it('pins one independent source snapshot to each Device sync-pack cycle', async () => {
  const server = await readJava('FolioleCompanionSyncGroupServer.java');
  const snapshot = await readJava('FolioleCompanionSyncGroupSnapshot.java');
  expect(server).toMatch(/syncPack[\s\S]*snapshots\.refresh\([\s\S]*peer/u);
  expect(server).toMatch(/contentBlobs[\s\S]*snapshots\.read\([\s\S]*peer/u);
  expect(snapshot).toContain('snapshots.put(peerDeviceId, next)');
  expect(snapshot).toContain('"create_snapshot"');
});

it('publishes Device discovery facts and waits for NSD retirement', async () => {
  const advertisement = await readJava('FolioleCompanionNsdAdvertisement.java');
  for (const key of [
    'group_id', 'group_tag', 'provider_device_id', 'provider_device_name',
    'provider_platform', 'runtime_instance_id'
  ]) expect(advertisement).toContain(`put(info, "${key}"`);
  expect(advertisement).toContain('unregistered.await(5, TimeUnit.SECONDS)');
  expect(advertisement).not.toMatch(/peer_id|timeline_id|authorization_id/u);
});

it('keeps provider lifecycle state complete and owned by one active bridge', async () => {
  const bridge = await readJava('FolioleCompanionSyncGroupDataBridge.java');
  const provider = await readJava('FolioleCompanionSyncGroupProvider.java');
  expect(provider).toContain('bridge.replaceDispatcher(dispatcher)');
  expect(provider).toContain('server = new FolioleCompanionSyncGroupServer');
  expect(provider).toContain('advertisement = FolioleCompanionNsdAdvertisement.start');
  expect(provider).toContain('advertisement = null; server = null;');
  expect(bridge).toContain('private static Object activeOwner;');
});
