import fs from 'node:fs';

import { expect, it } from 'vitest';

it('publishes the public action receipt before collecting post-action semantics', () => {
  const source = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSyncGroupMaintenanceTest.java',
    'utf8'
  );
  const sendEvidence = source.slice(source.indexOf('private static void sendEvidence('),
    source.indexOf('private static void sendDepartureEvidence('));
  expect(sendEvidence.indexOf('instrumentation.sendStatus(2, evidence)')).toBeLessThan(
    sendEvidence.indexOf('FolioleCompanionWebViewSemanticAdapter.snapshot')
  );
});
