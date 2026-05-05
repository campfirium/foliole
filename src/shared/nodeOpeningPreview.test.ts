import { describe, expect, it } from 'vitest';

import { extractNodeOpeningPreview, resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview';

describe('nodeOpeningPreview', () => {
  it('strips opaque anchor tags before computing the opening text', () => {
    const content = [
      '# Title',
      '',
      '<highlight id="anchor-1">First</highlight id="anchor-1"> paragraph.',
      '',
      'Later paragraph.'
    ].join('\n');

    expect(extractNodeOpeningPreview(content, 'Title')).toBe('First paragraph. Later paragraph.');
  });

  it('returns null when only the placeholder opening remains after normalization', () => {
    const content = '<highlight id="anchor-1">Linked PDF source ready for the reader surface.</highlight id="anchor-1">';

    expect(resolveNodeOpeningText(content, 'Title')).toBeNull();
  });
});
