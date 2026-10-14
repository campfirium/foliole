import { expect, it } from 'vitest';

import { asAnchorLink } from '../../../electron/ipc/commandParserAnchorLink.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR, evaluateSyncProtocolCompatibility } from '../../platform/syncProtocolContract.js';

import { parseStoredAnchorLink } from './anchorLinkCodec.js';

const fragment = (page: number) => ({ page, x: 0.2, y: 0.3, rects: [{ x: 0.1, y: 0.2, width: 0.2, height: 0.1 }] });
const anchor = { id: 'cross-page', kind: 'highlight', locator: { pages: [fragment(1), fragment(2)] } };

it('preserves every page through the IPC and stored anchor boundaries', () => {
  expect(asAnchorLink(anchor, 'anchor')).toEqual(anchor);
  expect(parseStoredAnchorLink(JSON.stringify(anchor))).toEqual(anchor);
});

it.each([
  { pages: [fragment(1)] },
  { pages: [fragment(3), fragment(1)] },
  { pages: [fragment(1), fragment(1)] },
  { pages: [fragment(1), { ...fragment(2), rects: [] }] },
  { pages: [fragment(1), { ...fragment(2), x: NaN }] },
  { pages: [fragment(1), fragment(2)], page: 1 }
])('rejects incomplete or ambiguous PDF locations: %j', locator => {
  expect(() => asAnchorLink({ ...anchor, locator }, 'anchor')).toThrow();
  expect(() => parseStoredAnchorLink(JSON.stringify({ ...anchor, locator }))).toThrow('Invalid stored PDF anchor locator');
});

it('rejects peers that can silently discard cross-page anchors', () => {
  const remote = { ...CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    capabilities: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.capabilities.filter(value => value !== 'pdf-cross-page-anchors-v1') };
  expect(evaluateSyncProtocolCompatibility(remote)).toMatchObject({
    reason: 'required_capability_missing', missing_capabilities: ['pdf-cross-page-anchors-v1']
  });
});

it('does not reinterpret PDF pages as text ranges when remapping or partitioning', async () => {
  const { remapRawStoredAnchorLink } = await import('./storedAnchorLinkRemap.js');
  const { bodyAnchorRanges, offsetBodyAnchor } = await import('./bodyPartitionAnchors.js');
  const value = JSON.stringify(anchor);
  expect(remapRawStoredAnchorLink({ value, nextContent: 'New body', previousContent: 'Old body' }))
    .toEqual({ reason: 'non_text_locator' });
  expect(bodyAnchorRanges(value)).toEqual([]);
  expect(offsetBodyAnchor(value, 42)).toBe(value);
});
