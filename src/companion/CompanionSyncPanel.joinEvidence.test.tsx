import fs from 'node:fs';

import { expect, it } from 'vitest';

it('exposes stable Device request states to physical-host acceptance', () => {
  const panel = fs.readFileSync('src/companion/CompanionSyncPanel.tsx', 'utf8');
  const states = fs.readFileSync('src/companion/CompanionSyncSetupStates.tsx', 'utf8');
  const scenario = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSyncGroupJoinScenario.java',
    'utf8'
  );
  expect(panel).toContain('data-testid="companion-sync-error"');
  expect(panel).toContain('data-error-code={props.error}');
  expect(states).toContain('data-testid="companion-sync-awaiting-approval"');
  expect(scenario).toContain('TimeUnit.SECONDS.toNanos(STAGE_TIMEOUT_SECONDS)');
  expect(scenario).toContain('"companion-sync-awaiting-approval", "companion-sync-error"');
  expect(scenario).toContain('"Sync Group Device request failed: "');
});
