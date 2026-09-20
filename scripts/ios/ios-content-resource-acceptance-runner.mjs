import { hostedProviderLifecyclePassed } from './ios-hosted-provider-evidence.mjs';

const IDS = {
  corrupt: '5703850972e2da20d5cd065cbb73c20c5d18778148a664b1238ce99120b1d301',
  external: 'ios-external:orchid.md',
  failed: 'e4bd1f4f95e08bac38c59af1b1ef34aeb05e77d1e54492c14c12b1ac570e2318',
  missing: '654aa8b756a2aa8b8acc8db2d4cee7746dd98a07ca7f2f2d5f19c1777bc37e2d',
  topic: 'ios-content-topic',
  valid: '7febd27ca8a54d7ceba45645ce394b49bc41d926ac176265d04996b7e9da8d2d'
};
const TOKENS = { external: 'external-orchid-token', pdf: 'pdf-cobalt-token', topic: 'topic-amber-token' };

export function verifyContentResourceAcceptance(first, second, firstObservations, secondObservations) {
  const firstPassed = first?.phase === 'resources-synced' && first?.resource_sync && evidencePassed(first.evidence);
  const secondPassed = second?.phase === 'resources-restored' && second?.resource_sync === null && evidencePassed(second.evidence);
  const observationsPassed = hostedProviderLifecyclePassed(secondObservations) &&
    firstObservations?.signature_headers_valid && firstObservations?.content_resource &&
    observationCountsPassed(firstObservations.content_resource) &&
    JSON.stringify(firstObservations.content_resource) === JSON.stringify(secondObservations?.content_resource);
  if (!firstPassed || !secondPassed || !observationsPassed) {
    throw new Error('iOS content resource acceptance evidence is incomplete.');
  }
  return {
    first,
    first_observations: firstObservations,
    second,
    second_observations: secondObservations
  };
}

function evidencePassed(evidence) {
  return evidence?.topic?.node_id === IDS.topic && evidence.topic.body_status === 'ready' &&
    evidence.topic.content?.includes(TOKENS.topic) &&
    evidence?.external?.document_id === IDS.external && evidence.external.body_status === 'ready' &&
    evidence.external.content?.includes(TOKENS.external) &&
    evidence?.pdf?.pages?.some((page) => page.text?.includes(TOKENS.pdf)) &&
    evidence.pdf.search_matches?.includes(IDS.valid) &&
    evidence?.searches?.topic?.includes(IDS.topic) && evidence.searches.external?.includes(IDS.external) &&
    evidence?.body_failures?.corrupt === 'failed' && evidence.body_failures.missing === 'failed' &&
    evidence?.resources?.valid?.status === 'ready' && evidence.resources.valid.mime_type === 'application/pdf' &&
    Boolean(evidence.resources.valid.resource_url) &&
    ['corrupt', 'failed', 'missing'].every((key) => evidence.resources[key] === 'missing_file');
}

function observationCountsPassed(observations) {
  const requested = observations.content_requested_hashes?.flat() ?? [];
  const firstRequests = observations.attachment_batch_requests ?? {};
  const fallback = observations.attachment_fallback_requests ?? {};
  return observations.content_batch_requests === 1 && requested.length === 4 && new Set(requested).size === 4 &&
    [IDS.corrupt, IDS.failed, IDS.missing, IDS.valid].every((id) => firstRequests[id] === 1) &&
    Object.keys(fallback).length === 0;
}
