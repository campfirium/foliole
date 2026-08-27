import fs from 'node:fs';

import { expect, it } from 'vitest';

it('keeps activation alive until the initial automatic sync is persisted', () => {
  const test = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSyncGroupMaintenanceTest.java',
    'utf8'
  );
  const scenario = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSyncGroupMaintenanceScenario.java',
    'utf8'
  );
  expect(test).toContain('.awaitInitialAutomaticSync(instrumentation.getTargetContext(), 30_000)');
  expect(test).toContain('.put("initialSyncPersisted", true)');
  expect(scenario).toContain("key = 'workspace_sync_last_synced_at'");
  expect(scenario).toContain("id = 'special-inbox'");
});
