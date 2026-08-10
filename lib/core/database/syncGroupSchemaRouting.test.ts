import { expect, it } from 'vitest';

import { ANDROID_COMPANION_SCHEMA_STATEMENTS } from './androidCompanionSchemaStatements.js';
import { COMPANION_SCHEMA_STATEMENTS } from './companionSchemaStatements.js';

it('keeps Sync Group member facts available to Android and the shared companion schema', () => {
  expect(ANDROID_COMPANION_SCHEMA_STATEMENTS.some((statement) => statement.includes('sync_group_members'))).toBe(true);
  expect(COMPANION_SCHEMA_STATEMENTS.some((statement) => statement.includes('sync_group_members'))).toBe(true);
});
