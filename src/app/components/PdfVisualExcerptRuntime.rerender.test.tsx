import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { PdfHighlightLocator } from './pdfHighlightLocators';
import { PdfVisualExcerptRuntimeProvider, useOptionalPdfVisualExcerptRuntime } from './PdfVisualExcerptRuntime';

const LOCATORS: PdfHighlightLocator[] = [];

function Probe(props: { seen: unknown[] }) {
  props.seen.push(useOptionalPdfVisualExcerptRuntime());
  return null;
}

function Host(props: { currentPage: number; seen: unknown[]; tick: number }) {
  return (
    <PdfVisualExcerptRuntimeProvider
      currentPage={props.currentPage}
      locators={LOCATORS}
      nodeId="pdf-node"
      rotation={0}
      source="asset://pdf"
    >
      <Probe seen={props.seen} />
    </PdfVisualExcerptRuntimeProvider>
  );
}

describe('PdfVisualExcerptRuntimeProvider re-renders', () => {
  it('keeps one context value while its inputs are unchanged and updates it for a new page', () => {
    const seen: unknown[] = [];
    const view = render(<Host currentPage={1} seen={seen} tick={0} />);
    const first = seen.at(-1);
    for (let tick = 1; tick <= 5; tick += 1) {
      view.rerender(<Host currentPage={1} seen={seen} tick={tick} />);
    }
    expect(new Set(seen.slice(1)).size).toBe(1);
    expect(seen.at(-1)).toBe(first);

    view.rerender(<Host currentPage={2} seen={seen} tick={6} />);
    const next = seen.at(-1) as { surfaceKey: string };
    expect(next).not.toBe(first);
    expect(next.surfaceKey).toBe('pdf-node:asset://pdf:2');
  });
});
