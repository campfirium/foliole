import { expect, it } from 'vitest';

import { ANDROID_COMPANION_SCHEMA_STATEMENTS } from './androidCompanionSchemaStatements.js';
import { COMPANION_SCHEMA_STATEMENTS } from './companionSchemaStatements.js';

it('installs Sync Group tables on Android without migrating the iOS companion schema', () => {
  expect(ANDROID_COMPANION_SCHEMA_STATEMENTS.some((statement) => statement.includes('sync_group_members'))).toBe(true);
  expect(COMPANION_SCHEMA_STATEMENTS.some((statement) => statement.includes('sync_group_members'))).toBe(false);
});
