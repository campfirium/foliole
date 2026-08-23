// @vitest-environment node
import { expect, it } from 'vitest';

import { loadIosAcceptanceContractCorpus } from './ios-acceptance-contract-corpus.ts';
import {
  createIosContentResourceObservations,
  routeIosContentResourceRequest
} from './ios-content-resource-acceptance-service.ts';

it('serves fixed-corpus resources with exact retry observations', () => {
  const fixture = loadIosAcceptanceContractCorpus().contentResource;
  const observations = createIosContentResourceObservations();
  const hashes = Object.values(fixture.contentBlobs).map((blob) => blob.hash);
  const content = route({ bodyText: JSON.stringify({ hashes }), fixture, observations, requestUrl: '/companion/content-blobs', method: 'POST' });

  expect(content).toMatchObject({ status: 200, headers: { 'Content-Type': expect.stringContaining('multipart/mixed') } });
  expect(content.body.includes(fixture.contentBlobs.topic.bytes)).toBe(true);
  expect(content.body.includes(fixture.contentBlobs.external.bytes)).toBe(true);
  expect(content.body.includes(fixture.contentBlobs.missing.bytes)).toBe(false);
  expect(content.body.includes(fixture.contentBlobs.corrupt.bytes)).toBe(false);
  expect(observations.content_requested_hashes).toEqual([hashes]);

  const statuses = {};
  for (const [kind, attachment] of Object.entries(fixture.attachments)) {
    const requestUrl = `/companion/attachment-resource?attachment_id=${attachment.id}&content_hash=${attachment.hash}`;
    statuses[kind] = route({ fixture, observations, requestUrl, method: 'GET' }).status;
    if (kind !== 'valid') route({ fixture, observations, requestUrl, method: 'GET' });
  }
  expect(statuses).toEqual({ corrupt: 200, failed: 503, missing: 404, valid: 200 });
  expect(observations.attachment_batch_requests).toEqual(Object.fromEntries(
    Object.values(fixture.attachments).map((attachment) => [attachment.id, 1])
  ));
  expect(observations.attachment_fallback_requests).toEqual(Object.fromEntries(
    Object.values(fixture.attachments).filter((attachment) => attachment.id !== fixture.attachments.valid.id)
      .map((attachment) => [attachment.id, 1])
  ));
});

function route(args) {
  const response = routeIosContentResourceRequest({ bodyText: '', ...args });
  if (!response) throw new Error(`Unhandled route: ${args.requestUrl}`);
  return response;
}
