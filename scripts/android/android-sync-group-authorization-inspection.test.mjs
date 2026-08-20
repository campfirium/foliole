// @vitest-environment node

import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';

import {
  inspectLocalActiveMemberAuthorizationFingerprint
} from './android-sync-group-authorization-inspection.mjs';

function databaseWithLocalAuthorizations(authorizations) {
  const tables = new Set(['sync_group_local_state', 'sync_group_members']);
  return { prepare: (sql) => ({
    all: () => authorizations.map((authorization_id) => ({ authorization_id })),
    get: (value) => sql.includes('sqlite_master') && tables.has(value)
      ? { present: 1 } : undefined
  }) };
}

it('hashes the unique active local member authorization without returning the raw value', () => {
  const authorization = 'authorization-a5';
  const fingerprint = inspectLocalActiveMemberAuthorizationFingerprint(
    databaseWithLocalAuthorizations([authorization])
  );
  expect(fingerprint).toBe(
    createHash('sha256').update(authorization).digest('hex').slice(0, 16)
  );
  expect(fingerprint).not.toContain(authorization);
});

it('fails closed when the local active member authorization is not unique', () => {
  expect(inspectLocalActiveMemberAuthorizationFingerprint(
    databaseWithLocalAuthorizations([])
  )).toBeNull();
  expect(inspectLocalActiveMemberAuthorizationFingerprint(
    databaseWithLocalAuthorizations(['authorization-a', 'authorization-b'])
  )).toBeNull();
});
