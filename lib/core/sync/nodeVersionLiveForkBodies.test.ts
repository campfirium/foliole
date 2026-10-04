import { expect, it } from 'vitest';

import { planNodeVersionChain, type ChainVersion } from './nodeVersionChainPlan.js';

function version(id: string, parent: string | null): ChainVersion {
  return { version_id: id, object_id: 'node', parent_version_id: parent,
    body_text: id, snapshot_json: JSON.stringify({ content: id }) };
}

it('keeps the base of a fork acquired indirectly behind a peer newer adopted head', () => {
  const versions = [version('p', null), version('q', 'p'), version('r', 'p'),
    version('relay', 'q'), version('local', 'q')];
  const edges = [{ version_id: 'relay', parent_version_id: 'q', ordinal: 0 },
    { version_id: 'relay', parent_version_id: 'r', ordinal: 1 }];
  const result = planNodeVersionChain(versions, edges, new Set(['local', 'relay']),
    new Set(), 100, new Set(['local']));
  expect(result.requiredBodyIds).toEqual(['local', 'p', 'q', 'relay']);
  expect(result.removed).toEqual(['r']);
});

it('retires that old base body once both adopted heads include the fork', () => {
  const versions = [version('p', null), version('q', 'p'), version('r', 'p'),
    version('merged', 'q'), version('next', 'merged')];
  const edges = [{ version_id: 'merged', parent_version_id: 'q', ordinal: 0 },
    { version_id: 'merged', parent_version_id: 'r', ordinal: 1 }];
  const result = planNodeVersionChain(versions, edges, new Set(['merged', 'next']),
    new Set(), 100, new Set(['next']));
  expect(result.requiredBodyIds).toEqual(['merged', 'next']);
  expect(result.removed).toEqual(['p', 'q', 'r']);
  expect(result.relations).toContainEqual({ id: 'merged', parents: ['q', 'r'] });
});
