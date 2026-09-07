import fs from 'node:fs';

import { expect, it } from 'vitest';

it('keeps activation separate from the isolated initial-run projection', () => {
  const test = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSyncGroupMaintenanceTest.java',
    'utf8'
  );
  expect(test).not.toContain('awaitInitialAutomaticSync');
  expect(test).toContain('.put("activated", true)');
  const projection = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleAcceptanceSyncEventProjection.java',
    'utf8'
  );
  expect(projection).toContain('"trigger_reason"');
  expect(projection).toContain('"run_id"');
  const action = fs.readFileSync('scripts/sync-group/a5-sync-group-action.mjs', 'utf8');
  expect(action).toContain("'read-sync-events': ['projectsSyncEventsForAcceptance', "
    + "'syncEventsProjected', false, true]");
});
