import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';
import { preloadTranslationCatalog } from '../../shared/localization/translations';

import { setPdfVisualSelectionKind } from './pdfSurfaceRegistration';
import { PdfVisualExcerptPageLayer } from './PdfVisualExcerptPageLayer';
import { PdfVisualExcerptRuntimeProvider } from './PdfVisualExcerptRuntime';
import { PdfVisualExcerptToolbarControls } from './PdfVisualExcerptToolbarControls';

function CursorHarness(props: { page?: number; source?: string }) {
  return (
    <LocalizationProvider initialLanguagePreference="en">
      <PdfVisualExcerptRuntimeProvider currentPage={props.page ?? 1} locators={[]} nodeId="pdf-1" rotation={0} source={props.source ?? 'fixture.pdf'}>
        <PdfVisualExcerptToolbarControls onToolbarInteraction={vi.fn()} />
        <div data-testid="page-root">
          <div className="textLayer"><span>Words</span></div>
          <PdfVisualExcerptPageLayer pageNumber={1} />
        </div>
      </PdfVisualExcerptRuntimeProvider>
    </LocalizationProvider>
  );
}

function dispatchPointerState(target: Element, type: 'pointerenter' | 'pointerleave', altKey = false) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'altKey', { value: altKey });
  target.dispatchEvent(event);
}

beforeAll(async () => preloadTranslationCatalog('en'));

afterEach(() => setPdfVisualSelectionKind(null));

it('clears temporary modifier cursor eligibility on keyup, pointer leave, and window blur', () => {
  render(<CursorHarness />);
  const root = screen.getByTestId('page-root');

  act(() => dispatchPointerState(root, 'pointerenter'));
  fireEvent.keyDown(window, { altKey: true, key: 'Alt' });
  expect(root).toHaveClass('pdf-visual-excerpt-enabled');
  fireEvent.keyUp(window, { key: 'Alt' });
  expect(root).not.toHaveClass('pdf-visual-excerpt-enabled');

  act(() => dispatchPointerState(root, 'pointerenter', true));
  expect(root).toHaveClass('pdf-visual-excerpt-enabled');
  act(() => dispatchPointerState(root, 'pointerleave', true));
  expect(root).not.toHaveClass('pdf-visual-excerpt-enabled');

  act(() => dispatchPointerState(root, 'pointerenter', true));
  fireEvent.blur(window);
  expect(root).not.toHaveClass('pdf-visual-excerpt-enabled');
});

it('keeps quick and explicit flows independent of temporary modifier state', async () => {
  render(<CursorHarness />);
  const root = screen.getByTestId('page-root');
  const toggle = screen.getByRole('button', { name: 'Region excerpt' });

  fireEvent.click(toggle);
  expect(root).toHaveClass('pdf-visual-excerpt-enabled');
  fireEvent.blur(window);
  expect(root).toHaveClass('pdf-visual-excerpt-enabled');
  fireEvent.click(toggle);
  expect(root).not.toHaveClass('pdf-visual-excerpt-enabled');

  act(() => setPdfVisualSelectionKind('highlight'));
  await waitFor(() => expect(root).toHaveClass('pdf-visual-excerpt-enabled'));
  act(() => setPdfVisualSelectionKind(null));
  await waitFor(() => expect(root).not.toHaveClass('pdf-visual-excerpt-enabled'));
  expect(toggle).toHaveAttribute('aria-pressed', 'false');
});

it('keeps quick mode across pages and resets it for another PDF surface', async () => {
  const { rerender } = render(<CursorHarness page={1} source="first.pdf" />);
  const toggle = screen.getByRole('button', { name: 'Region excerpt' });
  fireEvent.click(toggle);

  rerender(<CursorHarness page={2} source="first.pdf" />);
  expect(toggle).toHaveAttribute('aria-pressed', 'true');
  rerender(<CursorHarness page={1} source="second.pdf" />);
  await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'false'));
});
