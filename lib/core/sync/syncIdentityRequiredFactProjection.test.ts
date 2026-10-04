import { expect, it } from 'vitest';

import { projectSyncIdentityRequiredFacts,
  type RequiredFactVersion } from './syncIdentityRequiredFactProjection.js';

function version(id: string, parent: string | null = null): RequiredFactVersion {
  return { version_id: id, object_id: 'topic', parent_version_id: parent,
    body_text: id, snapshot_json: JSON.stringify({ content: id }),
    host_name: 'A', created_at: '2026-01-01T00:00:00.000Z', content_hash: id };
}
function edge(id: string, parent: string, ordinal = 0) {
  return { version_id: id, parent_version_id: parent, ordinal };
}

it('treats optional contracted ancestry as equivalent under a common head obligation', () => {
  const versions = [version('base'), version('deleted', 'base'),
    version('restored', 'deleted')];
  const full = projectSyncIdentityRequiredFacts({ versions,
    edges: [edge('deleted', 'base'), edge('restored', 'deleted')],
    protectedIds: new Set(['restored']) });
  const contracted = projectSyncIdentityRequiredFacts({ versions: [version('restored')],
    edges: [], protectedIds: new Set(['restored']) });
  expect(full).toEqual(contracted);
});

it('detects a missing branch required by an active hold', () => {
  const versions = [version('base'), version('left', 'base'), version('right', 'base'),
    version('merged', 'left')];
  const protectedIds = new Set(['merged', 'right']);
  const full = projectSyncIdentityRequiredFacts({ versions, protectedIds,
    edges: [edge('left', 'base'), edge('right', 'base'),
      edge('merged', 'left'), edge('merged', 'right', 1)] });
  const missing = projectSyncIdentityRequiredFacts({ versions, protectedIds,
    edges: [edge('left', 'base'), edge('right', 'base'), edge('merged', 'left')] });
  expect(full).not.toEqual(missing);
});

it('refuses to prove completion when a protected version body is absent', () => {
  const bodyless = { ...version('held'), body_text: null,
    snapshot_json: JSON.stringify({ content: null }) };
  expect(() => projectSyncIdentityRequiredFacts({ versions: [bodyless], edges: [],
    protectedIds: new Set(['held']) }))
    .toThrow('sync_identity_fact_projection_protected_body_unavailable');
});
