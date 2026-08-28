import fs from 'node:fs';

import { expect, it } from 'vitest';

it('reads runs only through the acceptance projection action', () => {
  const source = fs.readFileSync('scripts/android/a5-sync-event-proof.mjs', 'utf8');
  expect(source).toContain("action: 'read-sync-events'");
  expect(source).toContain('projectedEvents(receipt, ACCEPTANCE_APP_ID)');
  expect(source).toContain('selectProjectedRun');
  expect(source).not.toMatch(/SQLite|database|adb.*pull|run_id.*=/u);
});
