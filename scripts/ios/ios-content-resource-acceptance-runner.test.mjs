// @vitest-environment node
import { expect, it } from 'vitest';

import { verifyContentResourceAcceptance } from './ios-content-resource-acceptance-runner.mjs';
import { hostedProviderRegistrationEvidence } from './ios-hosted-provider-test-evidence.mjs';

function bridge(phase, resourceSync) {
  return {
    evidence: {
      body_failures: { corrupt: 'failed', missing: 'failed' },
      external: { body_status: 'ready', content: 'external-orchid-token', document_id: 'ios-external:orchid.md' },
      pdf: { pages: [{ text: 'pdf-cobalt-token' }], search_matches: ['7febd27ca8a54d7ceba45645ce394b49bc41d926ac176265d04996b7e9da8d2d'] },
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
        {"corrupt": "5703850972e2da20d5cd065cbb73c20c5d18778148a664b1238ce99120b1d301", "failed": "e4bd1f4f95e08bac38c59af1b1ef34aeb05e77d1e54492c14c12b1ac570e2318", "missing": "654aa8b756a2aa8b8acc8db2d4cee7746dd98a07ca7f2f2d5f19c1777bc37e2d", "valid": "7febd27ca8a54d7ceba45645ce394b49bc41d926ac176265d04996b7e9da8d2d"}[kind], 1
      ])),
      attachment_fallback_requests: {},
      content_batch_requests: 1,
      content_requested_hashes: [['a', 'b', 'c', 'd']]
    },
    registration: hostedProviderRegistrationEvidence(),
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
