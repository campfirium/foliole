import { describe, expect, it } from 'vitest';

import { extractDiscoursePublishTitle } from '../../../lib/core/discourse/discoursePublishTitle';

describe('Discourse publish title', () => {
  it('uses the first body H1 before the Topic title fallback', () => {
    expect(extractDiscoursePublishTitle('---\nauthor: Ada\n---\n# Body title\n\nText', 'Folder title')).toBe('Body title');
  });

  it('falls back to the Topic title when the body has no H1', () => {
    expect(extractDiscoursePublishTitle('## Section\n\nText', 'Folder title')).toBe('Folder title');
  });
});
