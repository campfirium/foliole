import { expect, it, vi } from 'vitest';

import { applyImportedHighlightAnchors } from '../../../lib/core/database/importHighlightAnchors.js';

it('wraps matched excerpts with the shared highlight serializer', () => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('11111111-1111-1111-1111-111111111111');
  const anchorId = 'imported-highlight-11111111-1111-1111-1111-111111111111';

  const anchored = applyImportedHighlightAnchors({
    content: 'Alpha Beta Gamma',
    highlights: [{ content: 'Beta', label: null }]
  });

  expect(anchored).toEqual({
    content: 'Alpha Beta Gamma',
    highlights: [{ anchorId, content: 'Beta', from: 6, kind: 'highlight', label: null, locatorText: 'Beta', to: 10 }]
  });
});

it('uses locator text as context while anchoring only the highlight text', () => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('22222222-2222-2222-2222-222222222222');
  const anchorId = 'imported-highlight-22222222-2222-2222-2222-222222222222';
  const anchored = applyImportedHighlightAnchors({
    content: 'Intro. Target sentence. Long paragraph tail that must stay outside the highlight.',
    highlights: [
      {
        content: 'Target sentence.\n※ Reader note',
        label: null,
        locatorText: 'Intro. Target sentence. Long paragraph tail that must stay outside the highlight.'
      }
    ]
  });

  expect(anchored.highlights).toEqual([
    {
      anchorId,
      content: 'Target sentence.\n※ Reader note',
      from: 7,
      kind: 'highlight',
      label: null,
      locatorText: 'Target sentence.',
      to: 23
    }
  ]);
});

it('prefers visible body content over matching frontmatter summary text', () => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('66666666-6666-6666-6666-666666666666');
  const anchorId = 'imported-highlight-66666666-6666-6666-6666-666666666666';
  const content = [
    '---',
    'summary: Target sentence appears in metadata first.',
    '---',
    '',
    'Intro.',
    'Target sentence appears in the article body.',
    'Tail.'
  ].join('\n');

  const anchored = applyImportedHighlightAnchors({
    content,
    highlights: [{ content: 'Target sentence appears', label: null }]
  });

  expect(anchored.highlights).toEqual([
    {
      anchorId,
      content: 'Target sentence appears',
      from: 68,
      kind: 'highlight',
      label: null,
      locatorText: 'Target sentence appears',
      to: 91
    }
  ]);
});

it('does not anchor imported highlights to frontmatter metadata', () => {
  const anchored = applyImportedHighlightAnchors({
    content: ['---', 'summary: Metadata-only highlight text.', '---', '', 'Visible body text.'].join('\n'),
    highlights: [{ content: 'Metadata-only highlight text', label: null }]
  });

  expect(anchored.highlights).toEqual([]);
});

it('prefers the full highlight text before fragment-bounded locator candidates', () => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('44444444-4444-4444-4444-444444444444');
  const anchorId = 'imported-highlight-44444444-4444-4444-4444-444444444444';
  const content = [
    '1. First step.',
    '',
    '2. Second step.',
    '',
    '3. Third step.',
    '',
    '4. Fourth step.',
    '',
    '5. Fifth step.',
    '',
    'Closing sentence with tail.'
  ].join('\n');
  const highlightText = [
    '1. First step.',
    '2. Second step.',
    '3. Third step.',
    '4. Fourth step.',
    '5. Fifth step.',
    'Closing sentence'
  ].join('\n');

  const anchored = applyImportedHighlightAnchors({
    content,
    highlights: [
      {
        content: highlightText,
        label: null,
        locatorText: '4. Fourth step.'
      }
    ]
  });

  expect(anchored.highlights).toEqual([
    {
      anchorId,
      content: highlightText,
      from: 0,
      kind: 'highlight',
      label: null,
      locatorText: [
        '1. First step.',
        '',
        '2. Second step.',
        '',
        '3. Third step.',
        '',
        '4. Fourth step.',
        '',
        '5. Fifth step.',
        '',
        'Closing sentence'
      ].join('\n'),
      to: 98
    }
  ]);
});

it('anchors a fragment-bounded parent range when the highlight text differs in the middle', () => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('33333333-3333-3333-3333-333333333333');
  const anchored = applyImportedHighlightAnchors({
    content: 'Lead. Alpha parent wording changed before Omega. Tail.',
    highlights: [
      {
        content: 'Alpha reader wording before Omega.',
        label: null,
        locatorText: 'Lead. Alpha parent wording changed before Omega. Tail.'
      }
    ]
  });

  expect(anchored.highlights[0]).toMatchObject({
    from: 6,
    locatorText: 'Alpha parent wording changed before Omega.',
    to: 48
  });
});

it('prefers a matched multi-paragraph locator before trimming it to a fragment', () => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('55555555-5555-5555-5555-555555555555');
  const locatorText = [
    'KS learning tool v0.4',
    '',
    'Download links and intro text.',
    '',
    '* Sentence analysis',
    '* Add Anki cards'
  ].join('\n');
  const anchored = applyImportedHighlightAnchors({
    content: `Lead.\n\n${locatorText}\n\nTail.`,
    highlights: [
      {
        content: [
          'KS learning tool v0.4[](https://example.com#ks-learning-tool-v04)',
          'Download links and intro text.',
          '• Sentence analysis',
          '• Add Anki cards'
        ].join('\n'),
        label: null,
        locatorText
      }
    ]
  });

  expect(anchored.highlights[0]?.locatorText).toBe(locatorText);
});

it('does not anchor a full locator context when it cannot be narrowed', () => {
  const longContext = `${'Context sentence. '.repeat(20)}Tail.`;
  const anchored = applyImportedHighlightAnchors({
    content: `Intro. ${longContext} Outro.`,
    highlights: [
      {
        content: 'Missing highlighted sentence.',
        label: null,
        locatorText: longContext
      }
    ]
  });

  expect(anchored.highlights).toEqual([]);
});

it('does not infer anchors when no matched highlights are provided', () => {
  const anchored = applyImportedHighlightAnchors({
    content: 'Alpha Beta Gamma',
    highlights: undefined
  });

  expect(anchored).toEqual({
    content: 'Alpha Beta Gamma',
    highlights: []
  });
});
