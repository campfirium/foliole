import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';
import type { CompanionPdfPageTextSearchResult } from '../shared/platform/companionSyncObjects';

import { createCompanionSearchResultsFixture } from './companionSearchTestFixtures';
import { renderCompanionShellSearchSurface } from './CompanionShellSearchSurface';

const searchCompanionFullText = vi.fn();

vi.mock('../shared/platform/companionFullTextSearch', () => ({
  searchCompanionFullText: (...args: unknown[]) => searchCompanionFullText(...args),
  supportsCompanionExtendedSearch: () => true
}));

vi.mock('../features/pdf/components/SimplePdfDocument', () => ({
  SimplePdfDocument: (props: {
    attachmentId: string;
    backLabel: string;
    initialPage: number;
    onBackToText(): void;
  }) => (
    <div>
      <p>{`PDF attachment ${props.attachmentId} page ${props.initialPage}`}</p>
      <button onClick={props.onBackToText} type="button">{props.backLabel}</button>
    </div>
  )
}));

function SearchSurfaceHarness() {
  const [pdfResult, setPdfResult] = useState<CompanionPdfPageTextSearchResult | null>(null);
  return renderCompanionShellSearchSurface({
    externalDocument: null,
    isTopicOpen: false,
    onExitExternalDocument: vi.fn(),
    onExitPdf: () => setPdfResult(null),
    onExitTopic: vi.fn(),
    onOpenExternalDocument: vi.fn(),
    onOpenPdf: setPdfResult,
    onOpenTopic: vi.fn(),
    pdfResult,
    surface: { activeAction: 'search' } as never,
    workspaceSync: { state: { endpoint_url: null, remembered_targets: [] } } as never
  });
}

describe('CompanionShellSearchSurface PDF routing', () => {
  it('opens the matched page and preserves the query after returning', async () => {
    searchCompanionFullText.mockResolvedValue(createCompanionSearchResultsFixture());
    renderWithLocalization(<SearchSurfaceHarness />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search topics' }), { target: { value: 'alpha' } });

    fireEvent.click(await screen.findByRole('button', { name: /PDF page 2/u }));
    expect(await screen.findByText('PDF attachment attachment-1 page 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('searchbox', { name: 'Search topics' })).toHaveValue('alpha');
  });
});
