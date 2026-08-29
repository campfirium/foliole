import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';
import { preloadTranslationCatalog } from '../../shared/localization/translations';

import { PdfVisualExcerptRuntimeProvider } from './PdfVisualExcerptRuntime';
import { PdfVisualExcerptToolbarControls } from './PdfVisualExcerptToolbarControls';

beforeAll(async () => preloadTranslationCatalog('en'));
afterEach(() => vi.restoreAllMocks());

it('shows platform and mode-specific tooltip content without changing the accessible name', async () => {
  vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel');
  render(
    <LocalizationProvider initialLanguagePreference="en">
      <PdfVisualExcerptRuntimeProvider currentPage={1} locators={[]} nodeId="pdf-1" rotation={0} source="fixture.pdf">
        <PdfVisualExcerptToolbarControls onToolbarInteraction={vi.fn()} />
      </PdfVisualExcerptRuntimeProvider>
    </LocalizationProvider>
  );
  const toggle = screen.getByRole('button', { name: 'Region excerpt' });

  fireEvent.focus(toggle);
  expect(await screen.findAllByText('Region excerpt (Ordinary)')).not.toHaveLength(0);
  expect(screen.getAllByText('Hold ⌥ and drag to excerpt any region on the page.')).not.toHaveLength(0);
  fireEvent.click(toggle);
  fireEvent.blur(toggle);
  fireEvent.focus(toggle);
  expect(await screen.findAllByText('Region excerpt (Quick)')).not.toHaveLength(0);
  expect(screen.getAllByText('Drag to excerpt any region on the page.')).not.toHaveLength(0);
  expect(toggle).toHaveAccessibleName('Region excerpt');
});
