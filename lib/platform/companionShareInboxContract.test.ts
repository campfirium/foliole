import { describe, expect, it } from 'vitest';

import {
  combineNativeCompanionShareParts,
  isNativeCompanionShareInboxPayload
} from './companionShareInboxContract.js';

describe('companion share inbox contract', () => {
  it('combines ordered values once while preserving boundary whitespace', () => {
    expect(combineNativeCompanionShareParts([
      { kind: 'title', value: 'Title' },
      { kind: 'text', value: '  body\n' },
      { kind: 'url', value: 'https://example.org/a?x=%2F' },
      { kind: 'text', value: 'https://example.org/a?x=%2F' }
    ])).toBe('Title\n\n  body\n\n\nhttps://example.org/a?x=%2F');
  });

  it('validates native delivery identities and part kinds', () => {
    expect(isNativeCompanionShareInboxPayload({ items: [{
      delivery_id: '00000000-0000-4000-8000-000000000001',
      parts: [{ kind: 'text', value: 'Note' }],
      received_at: '2026-09-21T00:00:00.000Z'
    }] })).toBe(true);
    expect(isNativeCompanionShareInboxPayload({ items: [{
      delivery_id: '../bad', parts: [], received_at: 'now'
    }] })).toBe(false);
    expect(isNativeCompanionShareInboxPayload({ items: [{
      delivery_id: '------------------------------------', parts: [], received_at: 'now'
    }] })).toBe(false);
  });
});
