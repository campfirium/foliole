// @vitest-environment node
import { expect, it } from 'vitest';

import { verifyContentResourceAcceptance } from './ios-content-resource-acceptance-runner.mjs';
import { hostedProviderRegistrationEvidence } from './ios-hosted-provider-test-evidence.mjs';

function bridge(phase, resourceSync) {
  return {
    evidence: {
      bodies: { corrupt: { body_status: 'ready', content: '# Corrupt\n\nexpected corrupt body' },
        missing: { body_status: 'ready', content: '# Missing\n\nexpected missing body' } },
      external: { body_status: 'ready', content: '# External\n\nexternal-orchid-token', document_id: 'ios-external:orchid.md' },
      pdf: { pages: [{ text: 'pdf-cobalt-token' }], search_matches: ['7febd27ca8a54d7ceba45645ce394b49bc41d926ac176265d04996b7e9da8d2d'] },
      resources: {
        corrupt: 'missing_file', failed: 'missing_file', missing: 'missing_file',
        valid: { mime_type: 'application/pdf', resource_url: 'capacitor://local.pdf', status: 'ready' }
      },
      searches: { external: ['ios-external:orchid.md'], topic: ['ios-content-topic'] },
      topic: { body_status: 'ready', content: '# Topic\n\ntopic-amber-token', node_id: 'ios-content-topic' }
    },
    phase,
    resource_sync: resourceSync
  };
}

function observations() {
  return {
    content_resource: {},
    registration: hostedProviderRegistrationEvidence(),
    signature_headers_valid: true
  };
}

it('requires complete persisted bodies, searches, and resource readability after restart', () => {
  const first = bridge('resources-synced', { remainingAttachmentResourceCount: 3 });
  const second = bridge('resources-restored', null);
  const firstObservations = observations();
  const secondObservations = JSON.parse(JSON.stringify(firstObservations));

  expect(verifyContentResourceAcceptance(first, second, firstObservations, secondObservations)).toMatchObject({ first, second });
  second.evidence.resources.valid.status = 'missing_file';
  expect(() => verifyContentResourceAcceptance(first, second, firstObservations, secondObservations))
    .toThrow('evidence is incomplete');
});
