import { expect, it } from 'vitest';

import { normalizeDesktopHostName } from './companionLanPayloads.js';

it('uses the host name without exposing the local-network suffix', () => {
  expect(normalizeDesktopHostName('Maci.local')).toBe('Maci');
  expect(normalizeDesktopHostName('ZEPHU-PC')).toBe('ZEPHU-PC');
});
