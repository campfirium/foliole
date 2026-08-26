import { expect, it } from 'vitest';

import { ANDROID_COMPANION_SCHEMA_STATEMENTS } from './androidCompanionSchemaStatements.js';
import { COMPANION_SCHEMA_STATEMENTS } from './companionSchemaStatements.js';

it('routes only Sync Group and Device facts to Android and shared companion schemas', () => {
  for (const statements of [ANDROID_COMPANION_SCHEMA_STATEMENTS, COMPANION_SCHEMA_STATEMENTS]) {
    expect(statements.some((statement) => statement.includes('sync_group_devices'))).toBe(true);
    expect(statements.some((statement) => statement.includes('sync_group_members'))).toBe(false);
  }
});
