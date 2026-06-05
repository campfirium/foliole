import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  collectTextSegmentsSpy,
  expectToolbarInteractionToKeepVisible,
  renderToolbarVisibilityHarness,
  setScrollTopAndScroll
} from './PdfDocumentViewport.toolbarVisibility.testSupport';

describe('PdfDocumentViewport toolbar visibility', () => {
  it('hides on downward scroll and returns on upward scroll', async () => {
    collectTextSegmentsSpy.mockReturnValue([]);
    const { scrollContainer, toolbar } = await renderToolbarVisibilityHarness();

    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');

    setScrollTopAndScroll(scrollContainer, 80);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');

    setScrollTopAndScroll(scrollContainer, 120);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');

    setScrollTopAndScroll(scrollContainer, 40);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  });

  it('stays visible while the search field is active', async () => {
    collectTextSegmentsSpy.mockImplementation((shell: HTMLDivElement) => {
      const span = shell.querySelector<HTMLElement>('.textLayer span[role="presentation"]');
      const node = span?.firstChild instanceof Text ? span.firstChild : new Text(span?.textContent ?? '');
      return span
        ? [{ element: span, end: node.textContent?.length ?? 0, node, start: 0, text: node.textContent ?? '' }]
        : [];
    });
    const { scrollContainer, toolbar } = await renderToolbarVisibilityHarness();
    const searchInput = screen.getByLabelText('PDF search');

    setScrollTopAndScroll(scrollContainer, 80);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');

    setScrollTopAndScroll(scrollContainer, 120);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');

    fireEvent.focus(searchInput);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');

    fireEvent.change(searchInput, { target: { value: 'keyword' } });
    setScrollTopAndScroll(scrollContainer, 160);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  });

  it('stays visible on the first restored scroll position before any user scroll gesture', async () => {
    collectTextSegmentsSpy.mockReturnValue([]);
    const { scrollContainer, toolbar } = await renderToolbarVisibilityHarness();

    setScrollTopAndScroll(scrollContainer, 220);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');

    setScrollTopAndScroll(scrollContainer, 280);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');
  });

  it('keeps the toolbar visible after page and zoom actions until the next reading scroll', async () => {
    collectTextSegmentsSpy.mockReturnValue([]);
    const { scrollContainer, toolbar } = await renderToolbarVisibilityHarness();

    setScrollTopAndScroll(scrollContainer, 80);
    setScrollTopAndScroll(scrollContainer, 120);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');

    await expectToolbarInteractionToKeepVisible(toolbar, () => fireEvent.click(screen.getByLabelText('Next page')));

    setScrollTopAndScroll(scrollContainer, 64);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');

    await expectToolbarInteractionToKeepVisible(toolbar, () => fireEvent.click(screen.getByLabelText('Zoom in')));

    setScrollTopAndScroll(scrollContainer, 96);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');
  });
});
