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

  it('keeps a short prose body when its automatic title contains the whole body', () => {
    expect(resolveNodeOpeningText('A quick note.', 'A quick note.')).toBe('A quick note.');
    expect(resolveNodeOpeningText('一小段正文', '一小段正文')).toBe('一小段正文');
  });

  it('still removes a title heading and repeated title when there is a separate body', () => {
    expect(resolveNodeOpeningText('# Title', 'Title')).toBeNull();
    expect(resolveNodeOpeningText('Title\n\nThe actual body.', 'Title')).toBe('The actual body.');
    expect(resolveNodeOpeningText('cover', 'cover')).toBeNull();
  });
});
