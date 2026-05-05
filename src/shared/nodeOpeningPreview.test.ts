import { describe, expect, it } from 'vitest';

import { extractNodeOpeningPreview, resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview';

describe('nodeOpeningPreview', () => {
  it('computes the opening text from plain markdown content', () => {
    const content = [
      '# Title',
      '',
      'First paragraph.',
      '',
      'Later paragraph.'
    ].join('\n');

    expect(extractNodeOpeningPreview(content, 'Title')).toBe('First paragraph. Later paragraph.');
  });

  it('returns null when only the placeholder opening remains after normalization', () => {
    const content = 'Linked PDF source ready for the reader surface.';

    expect(resolveNodeOpeningText(content, 'Title')).toBeNull();
  });
});
