import { describe, expect, it } from 'vitest';

import { createCompanionUuid } from './companionUuid';

describe('createCompanionUuid', () => {
  it('falls back to getRandomValues when a mobile WebView lacks randomUUID', () => {
    const originalRandomUUID = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: undefined
    });

    try {
      expect(createCompanionUuid()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    } finally {
      Object.defineProperty(crypto, 'randomUUID', {
        configurable: true,
        value: originalRandomUUID
      });
    }
  });
});
