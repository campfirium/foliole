import { expect, it } from 'vitest';

import { loadSyncIdentityNodeFactDescription } from './syncIdentityNodeFactReadAll.js';

const digest = 'a'.repeat(64);
const requirementsDigest = 'b'.repeat(64);
const version = { version_id: 'head', object_id: 'topic',
  parent_version_id: null, body_hash: 'body', content_hash: 'content',
  host_name: 'A', created_at: 'now', snapshot_metadata: '{}' };

function response(section: string, entries: unknown[], nextAfter: string | null = null) {
  return { node_id: 'topic', section, fact_digest: digest,
    requirements_digest: requirementsDigest, head_id: 'head', entries, nextAfter };
}

it('assembles four bounded fact sections from one fixed node identity', async () => {
  const facts = await loadSyncIdentityNodeFactDescription('topic', async (section) =>
    response(section, section === 'versions' ? [version] :
      section === 'requirements' ? [{ version_id: 'head', frozen: 0 }] : []));
  expect(facts).toMatchObject({ nodeId: 'topic', headId: 'head',
    versions: [version], parents: [], reviews: [],
    requirements: [{ version_id: 'head', frozen: 0 }] });
});

it('rejects a changed digest between paged sections', async () => {
  await expect(loadSyncIdentityNodeFactDescription('topic', async (section) => ({
    ...response(section, section === 'versions' ? [version] : []),
    fact_digest: section === 'parents' ? 'c'.repeat(64) : digest
  }))).rejects.toThrow('sync_identity_node_fact_page_invalid');
});

it('rejects a nonadvancing continuation', async () => {
  await expect(loadSyncIdentityNodeFactDescription('topic', async (section) =>
    response(section, section === 'versions' ? [version] : [],
      section === 'versions' ? 'head' : null)))
    .rejects.toThrow('sync_identity_node_fact_page_invalid');
});

it('rejects repeated facts within a page and across pages', async () => {
  await expect(loadSyncIdentityNodeFactDescription('topic', async (section) =>
    response(section, section === 'versions' ? [version, version] : [])))
    .rejects.toThrow('sync_identity_node_fact_page_invalid');
  await expect(loadSyncIdentityNodeFactDescription('topic', async (section, after) =>
    response(section, section === 'versions' ? [version] : [],
      section === 'versions' && after === null ? 'head' : null)))
    .rejects.toThrow('sync_identity_node_fact_page_invalid');
});

it('orders parent edges by numeric ordinal rather than cursor text', async () => {
  const parent = (ordinal: number) => ({ version_id: 'head', ordinal,
    parent_version_id: `p${ordinal}` });
  const read = (ordinals: number[]) => loadSyncIdentityNodeFactDescription('topic',
    async (section) => response(section, section === 'versions' ? [version] :
      section === 'parents' ? ordinals.map(parent) : []));
  await expect(read([2, 10])).resolves.toMatchObject({ parents: [parent(2), parent(10)] });
  await expect(read([10, 2])).rejects.toThrow('sync_identity_node_fact_page_invalid');
});

it('enforces the response budget in UTF-8 bytes', async () => {
  const oversized = { ...version, snapshot_metadata: '中'.repeat(25000) };
  await expect(loadSyncIdentityNodeFactDescription('topic', async (section) =>
    response(section, section === 'versions' ? [oversized] : [])))
    .rejects.toThrow('sync_identity_node_fact_page_invalid');
});
