import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSearchContent } from './CompanionSearchContent';
import { createCompanionSearchResultsFixture } from './companionSearchTestFixtures';

const searchCompanionFullText = vi.fn();
const supportsCompanionExtendedSearch = vi.fn(() => true);

vi.mock('../shared/platform/companionFullTextSearch', () => ({
  searchCompanionFullText: (...args: unknown[]) => searchCompanionFullText(...args),
  supportsCompanionExtendedSearch: () => supportsCompanionExtendedSearch()
}));

function emptySearchResults() {
  return {
    external: [],
    pdf: [],
    strategy: 'word-based',
    topics: []
  };
}

beforeEach(() => {
  searchCompanionFullText.mockReset();
  supportsCompanionExtendedSearch.mockReturnValue(true);
});

describe('CompanionSearchContent presentation', () => {
  it('describes the narrower synced-topic scope on iOS', () => {
    supportsCompanionExtendedSearch.mockReturnValue(false);
    renderWithLocalization(<CompanionSearchContent />);

    expect(screen.getByText('Topics synced to this device.')).toBeInTheDocument();
    expect(screen.queryByText('Topics and synced reading materials on this device.')).not.toBeInTheDocument();
  });

  it('renders a compact idle search surface', () => {
    renderWithLocalization(<CompanionSearchContent />);

    expect(screen.getByRole('heading', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByText('Local search')).toBeInTheDocument();
    expect(screen.getByText('Topics and synced reading materials on this device.')).toBeInTheDocument();
  });

  it('searches local companion content and renders result sections', async () => {
    searchCompanionFullText.mockResolvedValue(createCompanionSearchResultsFixture());

    renderWithLocalization(<CompanionSearchContent />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search topics' }), { target: { value: 'alpha' } });

    await waitFor(() => expect(searchCompanionFullText).toHaveBeenCalledWith('alpha', 20));
    expect(screen.getByText('Topics')).toBeInTheDocument();
    expect(screen.getByText('Topic Alpha')).toBeInTheDocument();
    expect(screen.getByText('PDF text')).toBeInTheDocument();
    expect(screen.getByText('PDF page 2')).toBeInTheDocument();
    expect(screen.getByText('External documents')).toBeInTheDocument();
    expect(screen.getByText('External Alpha')).toBeInTheDocument();
  });
});

describe('CompanionSearchContent states and actions', () => {
  it('opens topic, PDF, and external results through their shared readers', async () => {
    const onOpenExternalDocument = vi.fn();
    const onOpenPdf = vi.fn();
    const onOpenTopic = vi.fn();
    searchCompanionFullText.mockResolvedValue(createCompanionSearchResultsFixture());

    renderWithLocalization(
      <CompanionSearchContent
        onOpenExternalDocument={onOpenExternalDocument}
        onOpenPdf={onOpenPdf}
        onOpenTopic={onOpenTopic}
      />
    );
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search topics' }), { target: { value: 'alpha' } });

    fireEvent.click(await screen.findByRole('button', { name: /Topic Alpha/u }));
    expect(onOpenTopic).toHaveBeenCalledWith('topic-1');
    fireEvent.click(screen.getByRole('button', { name: /External Alpha/u }));
    expect(onOpenExternalDocument).toHaveBeenCalledWith(expect.objectContaining({ document_id: 'doc-1' }));
    fireEvent.click(screen.getByRole('button', { name: /PDF page 2/u }));
    expect(onOpenPdf).toHaveBeenCalledWith(expect.objectContaining({ attachment_id: 'attachment-1', page: 2 }));
  });

  it('shows an empty local result state', async () => {
    searchCompanionFullText.mockResolvedValue(emptySearchResults());

    renderWithLocalization(<CompanionSearchContent />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search topics' }), { target: { value: 'missing' } });

    expect(await screen.findByText('No local results found.')).toBeInTheDocument();
  });

  it('shows loading and error states without changing the search contract', async () => {
    const searchFailure: { reject: (() => void) | null } = { reject: null };
    searchCompanionFullText.mockReturnValueOnce(new Promise((_resolve, reject) => {
      searchFailure.reject = () => reject(new Error('failed'));
    }));

    renderWithLocalization(<CompanionSearchContent />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search topics' }), { target: { value: 'alpha' } });

    expect(screen.getByText('Searching...')).toBeInTheDocument();
    searchFailure.reject?.();
    expect(await screen.findByText('Search failed on this device.')).toBeInTheDocument();
  });
});
