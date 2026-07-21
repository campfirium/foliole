// @vitest-environment node
import { expect, it } from 'vitest';

import { verifyContentResourceAcceptance } from './ios-content-resource-acceptance-runner.mjs';

function bridge(phase, resourceSync) {
  return {
    evidence: {
      body_failures: { corrupt: 'failed', missing: 'failed' },
      external: { body_status: 'ready', content: 'external-orchid-token', document_id: 'ios-external:orchid.md' },
      pdf: { pages: [{ text: 'pdf-cobalt-token' }], search_matches: ['ios-acceptance-valid-attachment'] },
      resources: {
        corrupt: 'missing_file', failed: 'missing_file', missing: 'missing_file',
        valid: { mime_type: 'application/pdf', resource_url: 'capacitor://local.pdf', status: 'ready' }
      },
      searches: { external: ['ios-external:orchid.md'], topic: ['ios-content-topic'] },
      topic: { body_status: 'ready', content: 'topic-amber-token', node_id: 'ios-content-topic' }
    },
    phase,
    resource_sync: resourceSync
  };
}

function observations() {
  return {
    content_resource: {
      attachment_batch_requests: Object.fromEntries(['corrupt', 'failed', 'missing', 'valid'].map((kind) => [
        `ios-acceptance-${kind}-attachment`, 1
      ])),
      attachment_fallback_requests: {},
      content_batch_requests: 1,
      content_requested_hashes: [['a', 'b', 'c', 'd']]
    },
    signature_headers_valid: true
  };
}

it('requires complete read, failure, search, and no-redownload evidence', () => {
  const first = bridge('resources-synced', { content: {}, attachments: {} });
  const second = bridge('resources-restored', null);
  const firstObservations = observations();
  const secondObservations = JSON.parse(JSON.stringify(firstObservations));

  expect(verifyContentResourceAcceptance(first, second, firstObservations, secondObservations)).toMatchObject({ first, second });
  secondObservations.content_resource.content_batch_requests = 2;
  expect(() => verifyContentResourceAcceptance(first, second, firstObservations, secondObservations))
    .toThrow('evidence is incomplete');
});
