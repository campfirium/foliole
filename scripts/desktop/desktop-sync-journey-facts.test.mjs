// @vitest-environment node
/* global structuredClone */
import { expect, it } from 'vitest';

import { assertSameJourneyFacts, loadDesktopJourneyFacts } from './desktop-sync-journey-facts.mjs';

const facts = [
  { id: 'A1', title: 'Multi-device sync A fact', content: 'Original first Mac body' },
  { id: 'A2', title: 'Multi-device sync A fact', content: 'Original second Mac body' },
  { id: 'C1', title: 'Multi-device sync C fact', content: 'Original Windows body' }
];
it('hydrates complete documents rather than treating list metadata as body evidence', async () => {
  const session = { invoke: async (command, args) => command === 'load_workspace_list_snapshot'
    ? { nodesById: Object.fromEntries([...facts].reverse().map(({ id, title }) => [id, { title, content: '' }])) }
    : { nodeId: args.node_id, content: facts.find(node => node.id === args.node_id).content } };
  const actual = await loadDesktopJourneyFacts(session);
  expect(actual).toEqual(facts);
  expect(() => assertSameJourneyFacts(facts, actual)).not.toThrow();
});
it.each(['identity', 'body', 'missing'])('rejects %s loss in persisted or peer facts', fault => {
  const after = structuredClone(facts);
  if (fault === 'identity') after[1].id = 'unrelated';
  else if (fault === 'body') after[1].content = '';
  else after.pop();
  expect(() => assertSameJourneyFacts(facts, after)).toThrow('Journey facts changed');
});
