// @vitest-environment node

import fs from 'node:fs';

import { expect, it } from 'vitest';

it('keeps the fixed sync-event projection in the isolated Android test identity', () => {
  const source = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleAcceptanceSyncEventProjection.java',
    'utf8'
  );
  expect(source).toContain('"com.foliole.android.acceptance".equals(context.getPackageName())');
  for (const field of [
    'device_identity_key', 'run_id', 'trigger_reason', 'status', 'result',
    'started_at', 'occurred_at', 'application_id'
  ]) expect(source).toContain(`"${field}"`);
  expect(source).not.toMatch(/endpoint|workgroup_key|SELECT \*/u);
  expect(fs.existsSync(
    'android/app/src/main/java/com/foliole/android/FolioleAcceptanceSyncEventProjection.java'
  )).toBe(false);
});
