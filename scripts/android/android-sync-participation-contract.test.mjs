import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

/* global process */

const ROOT = process.cwd();
const JAVA = path.join(ROOT, 'android/app/src/main/java/com/foliole/android');

it('keeps permanent Android choices in private preferences and lifecycle transient', async () => {
  const store = await readFile(path.join(JAVA, 'FolioleCompanionSyncParticipationStore.java'), 'utf8');
  const plugin = await readFile(path.join(JAVA, 'FolioleCompanionSyncPlugin.java'), 'utf8');
  const lifecycle = await readFile(path.join(JAVA, 'FolioleCompanionPluginLifecycle.java'), 'utf8');
  expect(store).toContain('Context.MODE_PRIVATE');
  expect(store).toContain('.putBoolean(requestKey(context, "syncEnabled"), enabled).apply()');
  expect(store).toContain('.putBoolean(requestKey(context, "syncPaused"), paused).apply()');
  expect(lifecycle).toContain('active = false;');
  expect(lifecycle).toContain('active = true;');
  expect(plugin).not.toMatch(/setSyncPaused\([^)]*(?:handleOnPause|handleOnResume)/u);
});

it('keeps the native discovery adapter available for explicit Leave routing', async () => {
  const plugin = await readFile(path.join(JAVA, 'FolioleCompanionSyncPlugin.java'), 'utf8');
  const discoveryMethod = plugin.match(
    /@PluginMethod public void loadDiscoveryCandidates\(PluginCall call\) \{[\s\S]*?^[ ]{4}\}/mu
  )?.[0] ?? '';
  expect(discoveryMethod).toContain('FolioleCompanionNetworkPluginActions.loadDiscoveryCandidates');
  expect(discoveryMethod).not.toContain('isParticipating()');
});

it('generates narrow Capacitor request and state keys for participation', async () => {
  const contract = JSON.parse(await readFile(path.join(
    ROOT, 'android/app/src/main/assets/companion-bridge-contract-definitions.json'
  ), 'utf8'));
  expect(contract.hostApi.syncParticipation).toEqual({
    defaults: { syncEnabled: true, syncPaused: false },
    requestKeys: { syncEnabled: 'sync_enabled', syncPaused: 'sync_paused' },
    stateKeys: {
      lifecycleActive: 'lifecycle_active', participating: 'participating',
      syncEnabled: 'sync_enabled', syncPaused: 'sync_paused'
    },
    storage: { preferencesName: 'foliole_companion_sync_participation' }
  });
});
