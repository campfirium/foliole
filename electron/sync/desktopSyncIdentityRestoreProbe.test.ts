// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { syncIdentityPartitionDigest } from '../../lib/core/sync/syncIdentityDigest.js';
import { buildSyncIdentityRestoreSet } from '../../lib/core/sync/syncIdentityRestoreSet.js';

const runtime = vi.hoisted(() => ({ set: null as unknown, tamper: false,
  entries: [] as Array<{ object_type: string; object_id: string; fingerprint: string }> }));
vi.mock('./desktopSyncGroupHttp.js', () => ({
  fetchDesktopWorkgroupJson: async ({ pathWithQuery }: { pathWithQuery: string }) => {
    const url = new URL(pathWithQuery, 'http://peer');
    if (url.pathname.endsWith('restore-set')) return runtime.set;
    return { contract: 'global-id-v2', source_view_id: String(url.searchParams.get('source_view_id')),
      entries: runtime.tamper ? [] : runtime.entries,
      nextAfter: null };
  }
}));

import { probeDesktopSyncIdentityRestoreSet } from './desktopSyncIdentityRestoreProbe.js';

const args = { endpointUrl: 'http://peer', groupId: 'group', localDeviceId: 'target',
  peerDeviceId: 'source', restoreId: 'restore-1', secret: 'secret' };

function prepareSet() {
  runtime.entries = [
    { object_type: 'node', object_id: 'older', fingerprint: 'a'.repeat(64) },
    { object_type: 'setting', object_id: 'user-space', fingerprint: 'b'.repeat(64) }
  ];
  const inventory = { row_count: runtime.entries.length, digest: syncIdentityPartitionDigest(runtime.entries) };
  runtime.set = buildSyncIdentityRestoreSet({ ...args,
    restore_id: args.restoreId, group_id: args.groupId,
    source_peer_id: args.peerDeviceId, target_peer_id: args.localDeviceId,
    source_view_id: '12345678-1234-1234-1234-123456789abc',
    source_epoch: 'c'.repeat(32), fact_proof_root: 'd'.repeat(64),
    fact_data_root: 'e'.repeat(64), inventory });
}

it('stages every source identity without reading receiver state', async () => {
  prepareSet();
  runtime.tamper = false;
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-restore-probe-'));
  try {
    const result = await probeDesktopSyncIdentityRestoreSet({ ...args, outputRoot });
    try {
      expect(result.count).toBe(2);
      const db = new Database(result.candidatePath, { readonly: true });
      try {
        expect(db.prepare(`SELECT object_type, object_id, kind FROM candidates
          ORDER BY object_type, object_id`).all()).toEqual([
          { object_type: 'node', object_id: 'older', kind: 'source_only' },
          { object_type: 'setting', object_id: 'user-space', kind: 'source_only' }
        ]);
      } finally { db.close(); }
    } finally { await result.cleanup(); }
    runtime.tamper = true;
    await expect(probeDesktopSyncIdentityRestoreSet({ ...args, outputRoot }))
      .rejects.toThrow('sync_identity_global_inventory_mismatch');
    expect(await fs.readdir(outputRoot)).toEqual([]);
  } finally { await fs.rm(outputRoot, { recursive: true, force: true }); }
});
