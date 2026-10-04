import { z } from 'zod';

import { syncIdentityFingerprint } from './syncIdentityDigest.js';
import { compareSyncIdentityText } from './syncIdentityKeyOrder.js';
import { buildSyncIdentityPackPage, type SyncIdentityPackPage } from './syncIdentityPackPage.js';

const text = z.string().min(1).max(2048);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const requirementsSchema = z.object({ node_id: text, section: z.literal('requirements'),
  head_id: text.nullable(), fact_digest: digest });
const versionSchema = z.object({ version_id: text, object_id: text, content_hash: z.string().min(1),
  body_hash: digest.nullable(), snapshot_metadata: z.string() });
const versionsSchema = z.object({ node_id: text, section: z.literal('versions'),
  head_id: text.nullable(), fact_digest: digest, entries: z.array(versionSchema).max(128),
  nextAfter: text.nullable() });
const snapshotSchema = z.object({ id: text, parent_id: text.nullable(), deleted_at: text.nullable() });

function parseSnapshot(value: string) {
  try { return snapshotSchema.parse(JSON.parse(value)); }
  catch { throw new Error('sync_identity_source_head_snapshot_invalid'); }
}

export type SyncIdentitySourceDescriptorReader = (args: {
  nodeId: string; section: 'requirements' | 'versions'; after: string | null;
}) => Promise<unknown>;

/** Locate the current original in bounded metadata pages from the same fixed view. */
export async function readSyncIdentityOriginalSourceHead(read: SyncIdentitySourceDescriptorReader, nodeId: string) {
  const requirements = requirementsSchema.parse(await read({ nodeId, section: 'requirements', after: null }));
  if (requirements.node_id !== nodeId || !requirements.head_id) {
    throw new Error(`sync_identity_original_head_missing:${nodeId}`);
  }
  let after: string | null = null;
  for (;;) {
    const page = versionsSchema.parse(await read({ nodeId, section: 'versions', after }));
    if (page.node_id !== nodeId || page.head_id !== requirements.head_id ||
        page.fact_digest !== requirements.fact_digest) throw new Error('sync_identity_source_view_changed');
    let previous: string | null = after;
    for (const entry of page.entries) {
      if (entry.object_id !== nodeId || previous !== null &&
          compareSyncIdentityText(previous, entry.version_id) >= 0) throw new Error('sync_identity_source_fact_page_invalid');
      previous = entry.version_id;
    }
    const head = page.entries.find((entry) => entry.version_id === requirements.head_id);
    if (head) {
      if (head.body_hash === null) throw new Error(`sync_pack_fact_body_unavailable:${head.version_id}`);
      const snapshot = parseSnapshot(head.snapshot_metadata);
      if (snapshot.id !== nodeId) throw new Error('sync_identity_source_head_cross_object');
      return { nodeId, head, snapshot, digest: requirements.fact_digest };
    }
    if (page.nextAfter === null) throw new Error(`sync_identity_original_head_missing:${nodeId}`);
    if (page.nextAfter !== previous || page.nextAfter === after) throw new Error('sync_identity_source_fact_page_invalid');
    after = page.nextAfter;
  }
}

/** Host readers supply fixed-view descriptors; shared exchange owns all sequencing and transfer. */
export function createSyncIdentityStructuralParentReader(read: SyncIdentitySourceDescriptorReader,
  initial: Awaited<ReturnType<typeof readSyncIdentityOriginalSourceHead>>) {
  const seen = new Set<string>();
  let current = initial;
  return async (page: SyncIdentityPackPage): Promise<SyncIdentityPackPage | null> => {
    const object = page.objects[0];
    if (page.objects.length !== 1 || object?.object_type !== 'node') throw new Error('sync_identity_parent_scope_invalid');
    if (seen.has(object.object_id)) throw new Error('sync_pack_node_parent_cycle');
    seen.add(object.object_id);
    if (current.nodeId !== object.object_id) current = await readSyncIdentityOriginalSourceHead(read, object.object_id);
    const parentId = current.snapshot.parent_id;
    if (parentId === null || parentId === 'special-inbox' || parentId === 'special-virtual-root') return null;
    if (seen.has(parentId)) throw new Error('sync_pack_node_parent_cycle');
    current = await readSyncIdentityOriginalSourceHead(read, parentId);
    if (current.snapshot.deleted_at !== null) throw new Error(`sync_pack_node_parent_deleted:${parentId}`);
    return buildSyncIdentityPackPage({ ...page, objects: [{ object_type: 'node', object_id: parentId,
      fingerprint: syncIdentityFingerprint({ object_type: 'node', object_id: parentId,
        content_hash: current.head.content_hash, current_version_id: current.head.version_id,
        deleted_at: current.snapshot.deleted_at }) }],
    facts: { section: 'head', after: null, limit: 64, digest: current.digest } });
  };
}
