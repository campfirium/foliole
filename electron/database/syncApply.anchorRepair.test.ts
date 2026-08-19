// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-apply-anchor-repair-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { applySyncNodesAsync } from './syncApply.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-apply-anchor-repair-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('warns when parent apply cannot remap a local child text anchor', async () => {
  insertLocalNode({ id: 'parent-1', content: 'Alpha Beta Gamma', versionId: 'desktop#parent-v1' });
  insertLocalNode({
    anchorLink: JSON.stringify({
      id: 'anchor-1',
      kind: 'highlight',
      locator: { from: 6, originalText: 'Beta', to: 10 }
    }),
    id: 'child-1',
    parentId: 'parent-1'
  });
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  await expect(applySyncNodesAsync([parentRecord('Beta Alpha Beta Gamma')])).resolves.toEqual(['parent-1']);

  expect(warnSpy).toHaveBeenCalledWith('[sync] unmapped child text anchor after parent apply', {
    anchorId: 'anchor-1',
    nodeId: 'child-1',
    parentNodeId: 'parent-1',
    reason: 'ambiguous_text'
  });
  warnSpy.mockRestore();
});

function insertLocalNode(args: {
  anchorLink?: string | null;
  content?: string;
  id: string;
  parentId?: string | null;
  versionId?: string;
}) {
  openDatabaseConnection().sqlite.prepare(
    `INSERT INTO nodes (
       id, parent_id, kind, title, content, anchor_link, current_version_id,
       last_modified_by_host_name, sync_dirty, created_at, updated_at
     ) VALUES (?, ?, 'topic', ?, ?, ?, ?, 'desktop', 0, ?, ?)`
  ).run(
    args.id,
    args.parentId ?? null,
    args.id,
    args.content ?? `${args.id} body`,
    args.anchorLink ?? null,
    args.versionId ?? `desktop#${args.id}-v1`,
    '2026-05-10T07:00:00.000Z',
    '2026-05-10T07:00:00.000Z'
  );
}

function parentRecord(content: string): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: ['desktop#parent-v1'],
    content_hash: 'phone#parent-v2-hash',
    host_name: 'phone',
    object_id: 'parent-1',
    object_type: 'node',
    parent_version_id: 'desktop#parent-v1',
    snapshot: {
      anchor_link: null,
      attachments: [],
      content,
      created_at: '2026-05-10T07:00:00.000Z',
      deleted_at: null,
      desired_retention: null,
      hide_title_heading: false,
      id: 'parent-1',
      image_regions: null,
      is_title_manual: true,
      kind: 'topic',
      opening_text: null,
      parent_id: null,
      position: 0,
      priority: null,
      reveal: null,
      title: 'parent-1',
      updated_at: '2026-05-10T08:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-05-10T08:00:00.000Z',
    version_created_at: '2026-05-10T08:00:00.000Z',
    version_id: 'phone#parent-v2'
  };
}
