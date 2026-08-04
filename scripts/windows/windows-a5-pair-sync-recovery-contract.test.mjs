// @vitest-environment node

import { expect, it } from 'vitest';

import {
  parsePairSyncRecoveryInstrumentation, parsePairSyncRecoveryReadiness
} from './windows-a5-pair-sync-recovery-contract.mjs';
import { sanitizePairSyncDataProtection } from './windows-a5-pair-sync-recovery-action.mjs';

it('keeps readiness evidence non-sensitive and fails closed', () => {
  const readiness = parsePairSyncRecoveryReadiness(
    `[android-data] pair-sync-recovery-readiness=${JSON.stringify({
      deviceIdentityFingerprint: '0123456789abcdef', dirtyRecordCount: 0,
      missingPrerequisites: [], nodeCount: 0, pairingCredentialsPresent: false,
      resultStatus: 'ready', schemaVersion: 1, endpoint: 'must-be-dropped'
    })}`
  );
  expect(readiness).not.toHaveProperty('endpoint');
  expect(readiness).toMatchObject({ resultStatus: 'ready' });
});

it('accepts only the fixed product pairing receipt', () => {
  const output = `INSTRUMENTATION_STATUS: folioleActionReceipt=${JSON.stringify({
    initialSyncRequested: true, ok: true, paired: true,
    targetTestId: 'companion-pair-sync-recovery'
  })}\nINSTRUMENTATION_CODE: -1\n`;
  expect(parsePairSyncRecoveryInstrumentation(output)).toMatchObject({ paired: true });
  expect(() => parsePairSyncRecoveryInstrumentation(output.replace('paired":true', 'paired":false')))
    .toThrow('incomplete');
});

it('removes device paths and raw snapshot details from data-protection evidence', () => {
  const evidence = sanitizePairSyncDataProtection({
    backup: { created: true, databasePath: 'C:\\secret\\device.db' },
    snapshot: { database: { counts: { nodes: 0 }, path: 'C:\\secret\\pulled.db' }, serial: 'raw-serial' }
  });
  expect(evidence).toEqual({ backupCreated: true, databasePreserved: true, nodeCountBefore: 0, schemaVersion: 1 });
  expect(JSON.stringify(evidence)).not.toContain('secret');
  expect(JSON.stringify(evidence)).not.toContain('serial');
});
