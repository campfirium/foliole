// @vitest-environment node
/* global process */
import { createRequire } from 'node:module';

import { expect, it } from 'vitest';

import { resolveIosDatabaseUpgradeContractFixture } from './ios-database-upgrade-contract-fixture.mjs';
import {
  assertLatestUpgradeFixtureProvenance,
  readIosDatabaseUpgradeSnapshot
} from './ios-database-upgrade-acceptance-fixture.ts';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3');

it('binds the versioned previous-version database to the current upgrade product contract', () => {
  assertLatestUpgradeFixtureProvenance();
  const { databasePath, identity } = resolveIosDatabaseUpgradeContractFixture(process.cwd());
  expect(identity.file).toBe('v4-foliole-companionSQLite.db');
  const sqlite = new BetterSqlite3(databasePath, { readonly: true });
  try {
    const snapshot = readIosDatabaseUpgradeSnapshot(sqlite);
    expect(snapshot).toEqual({
      attachment_count: 1,
      attachment_mime_type: 'image/png',
      attachment_name: 'sample.png',
      attachment_role: 'inline',
      blob_availability: 'cached',
      blob_content_hash: 'resource-hash',
      cursor: '41',
      device_id: 'ios-upgrade-device',
      node_count: 1,
      open_state_table_exists: 0,
      node_review_count: 1,
      node_review_due: '2026-07-21T00:00:00.000Z',
      node_title: 'Upgrade',
      provenance_columns: ['import_source_fingerprint', 'import_content_fingerprint'],
      resource_count: 1,
      review_log_count: 1,
      review_log_grade: 3,
      review_log_op_id: 'op-1',
      setting_count: 1,
      setting_value: '"dark"',
      state_sequence_column: 0,
      sync_state_count: 2,
      user_version: 4,
      view_count: 1,
      view_scroll_top: 42,
      view_source: 'user-scroll'
    });
  } finally {
    sqlite.close();
  }
});
