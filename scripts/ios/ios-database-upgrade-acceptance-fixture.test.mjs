// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createIosDatabaseUpgradeFixture } from './ios-database-upgrade-acceptance-fixture.ts';

it('derives the previous-version upgrade fixture from the latest formal migration metadata', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-ios-upgrade-'));
  try {
    const snapshot = createIosDatabaseUpgradeFixture(path.join(root, 'fixture.db'));
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
      user_version: 19,
      view_count: 1,
      view_scroll_top: 42,
      view_source: 'user-scroll'
    });
  } finally {
    fs.rmSync(root, { force: true, recursive: true });
  }
});
