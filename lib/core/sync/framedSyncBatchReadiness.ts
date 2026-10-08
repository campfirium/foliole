import type { OutboundPublishInput } from './framedSyncStagingContract.js';

type Publication = Pick<OutboundPublishInput, 'manifest'>;

/** Original database units keep their own validation, transaction and receipt when packed together. */
export function isFramedSyncPublicationBatchReady(publication: Publication): boolean {
  const facts = publication.manifest.facts;
  if (!facts.length) return false;
  const first = facts[0];
  return Boolean(first && facts.every(fact => [1, 2, 3, 4].includes(fact.kind) &&
    fact.globalId === first.globalId && fact.objectType === first.objectType));
}
