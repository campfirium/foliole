import { hostedProviderLifecyclePassed } from './ios-hosted-provider-evidence.mjs';

const IDS = {
  corrupt: 'ios-acceptance-corrupt-attachment',
  external: 'ios-external:orchid.md',
  failed: 'ios-acceptance-failed-attachment',
  missing: 'ios-acceptance-missing-attachment',
  topic: 'ios-content-topic',
  valid: 'ios-acceptance-valid-attachment'
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
    Object.values(IDS).filter((id) => id.includes('attachment')).every((id) => firstRequests[id] === 1) &&
    Object.keys(fallback).length === 0;
}
