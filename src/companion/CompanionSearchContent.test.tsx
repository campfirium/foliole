import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSearchContent } from './CompanionSearchContent';

const searchCompanionFullText = vi.fn();

vi.mock('../shared/platform/companionFullTextSearch', () => ({
  searchCompanionFullText: (...args: unknown[]) => searchCompanionFullText(...args)
}));

function localSearchResults() {
  return {
    external: [{
      bodyStatus: 'ready',
      content: 'External alpha body',
      document_id: 'doc-1',
      excerpt: 'External alpha excerpt',
      extension: '.md',
      file_name: 'external.md',
      folder_id: 'folder-1',
      match_start: 9,
      opening_text: 'External opening',
      relative_path: 'notes/external.md',
      title: 'External Alpha',
      updated_at: '2026-06-15T08:00:00.000Z'
    }],
    pdf: [{
      attachment_id: 'attachment-1',
      excerpt: 'PDF alpha excerpt',
      match_start: 4,
      page: 2,
      page_height: null,
      page_width: null,
      text: 'PDF alpha text'
    }],
    strategy: 'word-based',
    topics: [{
      bodyStatus: 'ready',
      excerpt: 'Topic alpha excerpt',
      matchStart: 1,
      nodeId: 'topic-1',
      openingText: 'Topic opening',
      title: 'Topic Alpha',
      updatedAt: '2026-06-15T08:00:00.000Z'
    }]
  };
}

function emptySearchResults() {
  return {
    external: [],
    pdf: [],
    strategy: 'word-based',
    topics: []
  };
}

describe('CompanionSearchContent', () => {
  beforeEach(() => {
    searchCompanionFullText.mockReset();
  });

  it('renders a compact idle search surface', () => {
    renderWithLocalization(<CompanionSearchContent />);

    expect(screen.getByRole('heading', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByText('Local search')).toBeInTheDocument();
    expect(screen.getByText('Topics, PDF text, and external documents on this device.')).toBeInTheDocument();
  });

  it('searches local companion content and renders result sections', async () => {
    searchCompanionFullText.mockResolvedValue(localSearchResults());

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
