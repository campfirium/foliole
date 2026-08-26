// @vitest-environment node

import fs from 'node:fs';
import { expect, it } from 'vitest';

const read = (name) => fs.readFileSync(
  `android/app/src/main/java/com/foliole/android/${name}`, 'utf8'
);

it('keeps the Android join prepare Capacitor bridge complete but inactive', () => {
  const plugin = read('FolioleCompanionJoinRequestPlugin.java');
  const activity = read('MainActivity.java');
  expect(plugin).toContain('@CapacitorPlugin(name = "FolioleSyncGroupJoinPrepare")');
  for (const method of [
    'receiveRequest', 'loadRequests', 'acceptRequest', 'collectAcceptance', 'rejectRequest'
  ]) {
    expect(plugin).toContain(`@PluginMethod public void ${method}(PluginCall call)`);
  }
  expect(plugin).toContain('sync_group_join_provider_unavailable');
  expect(activity).not.toContain('registerPlugin(FolioleCompanionJoinRequestPlugin.class)');
});

it('keeps bridge work in the native provider instead of old authorization stores', () => {
  const plugin = read('FolioleCompanionJoinRequestPlugin.java');
  const provider = read('FolioleCompanionJoinRequestProvider.java');
  expect(plugin).toContain('FolioleCompanionJoinRequestProvider');
  expect(plugin).not.toMatch(/PairingStore|JoinGrantStore|PeerStore|authorization_id/u);
  expect(provider).not.toMatch(/PairingStore|JoinGrantStore|PeerStore|authorization_id/u);
});
