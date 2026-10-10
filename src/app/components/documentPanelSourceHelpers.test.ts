import { expect, it } from 'vitest';

import { isLikelyPdfSourceReference } from './documentPanelSourceHelpers';

it.each([
  'sample.pdf', '/documents/sample.PDF', '../sample.pdf',
  'C:\\documents\\sample.pdf', 'https://example.com/sample.pdf?download=1',
  'file:///documents/sample.pdf#page=2', '# Title\n\nsample.pdf',
  'Linked PDF source ready for the reader surface.'
])('recognizes the PDF source reference %s', (content) => {
  expect(isLikelyPdfSourceReference(content)).toBe(true);
});

it.each([':sample.pdf', '.pdf', 'ordinary body', 'sample.pdf\nBody.', '---\nsource: sample.pdf\n---'])('keeps ordinary Markdown visible for %s', (content) => {
  expect(isLikelyPdfSourceReference(content)).toBe(false);
});

it('classifies a complete bounded Unicode body without blocking the document surface', () => {
  const content = '中文😀'.repeat(104_857);
  const startedAt = performance.now();
  expect(isLikelyPdfSourceReference(content)).toBe(false);
  expect(performance.now() - startedAt).toBeLessThan(1_000);
});
