import { expect, it } from 'vitest';

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import { alternativeForBody, normalizeTextAlternatives } from './topicTextState.js';

const now = '2026-10-07T00:00:00.000Z';
function alternative(body: string, versionId: string) {
  return alternativeForBody({ object_id: 'topic', body_text: body, version_id: versionId,
    version_created_at: now, host_name: 'Host', snapshot: {} } as NativeSyncNodeRecord, now);
}

it('deduplicates the same body across original versions and preserves its earliest expiry', () => {
  const first = alternative('Other', 'first');
  const second = { ...alternative('Other', 'second'), expires_at: '2026-12-07T00:00:00.000Z' };
  expect(normalizeTextAlternatives([second, first], 'Main', now)).toEqual([first]);
});

it('excludes the main body, expired bodies and excess oldest attachments', () => {
  const entries = ['Main', 'A', 'B', 'C', 'D'].map((body, index) => ({
    ...alternative(body, body), created_at: `2026-10-0${index + 1}T00:00:00.000Z`
  }));
  const retained = normalizeTextAlternatives(entries, 'Main', now);
  expect(retained.map((entry) => entry.id)).toEqual(entries.slice(2).reverse().map((entry) => entry.id));
  expect(normalizeTextAlternatives(retained, 'Main', '2026-12-07T00:00:00.000Z')).toEqual([]);
});
