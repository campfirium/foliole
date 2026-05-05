import { expect, it } from 'vitest';

import { hasCachedMarkdownImageReference } from './documentPanelImageReferenceCache';

it('detects markdown image references', () => {
  expect(hasCachedMarkdownImageReference('![cover](./cover.png)')).toBe(true);
  expect(hasCachedMarkdownImageReference('plain text only')).toBe(false);
});
