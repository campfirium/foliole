import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';
import type { CompanionFullTextSearchResults } from '../shared/platform/companionFullTextSearch';

import { CompanionSearchContent } from './CompanionSearchContent';
import { createCompanionSearchResultsFixture } from './companionSearchTestFixtures';

const search = vi.hoisted(() => vi.fn());
vi.mock('../shared/platform/companionFullTextSearch', () => ({
  isCompanionSearchTopicAvailable: async () => true,
  searchCompanionFullTextSnapshot: search,
  supportsCompanionExtendedSearch: () => true
}));
beforeEach(() => search.mockReset());

function page(start: number, count: number): CompanionFullTextSearchResults {
  const sample = createCompanionSearchResultsFixture();
  return {
    strategy: sample.strategy,
    topics: Array.from({ length: count }, (_, i) => ({ ...sample.topics[0]!, nodeId: `topic-${start + i}`, title: `Topic ${start + i}` })),
    pdf: Array.from({ length: count }, (_, i) => ({ ...sample.pdf[0]!, page: start + i + 1 })),
    external: Array.from({ length: count }, (_, i) => ({ ...sample.external[0]!, document_id: `doc-${start + i}`, title: `External ${start + i}` }))
  };
}
function begin() {
  renderWithLocalization(<CompanionSearchContent />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'alpha' } });
}

it('reveals all three fixed result sets without querying the changed library again', async () => {
  search.mockResolvedValueOnce(page(0, 42)).mockResolvedValueOnce(page(90, 1));
  begin();
  fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
  expect(await screen.findByText('Topic 21')).toBeInTheDocument();
  expect(screen.getByText('External 21')).toBeInTheDocument();
  expect(screen.getByText('PDF page 22')).toBeInTheDocument();
  expect(screen.getByText('Topic 0')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
  expect(await screen.findByText('Topic 41')).toBeInTheDocument();
  expect(search).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Search again' }));
  expect(await screen.findByText('Topic 90')).toBeInTheDocument();
  expect(screen.queryByText('Topic 0')).not.toBeInTheDocument();
  expect(screen.getByRole('searchbox')).toHaveValue('alpha');
});

it('retries failed snapshot creation without publishing a partial list', async () => {
  search.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page(20, 1));
  begin();
  await screen.findByText(/Search failed/u);
  expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Search again' }));
  expect(await screen.findByText('Topic 20')).toBeInTheDocument();
  expect(search.mock.calls[0]).toEqual(search.mock.calls[1]);
});

it('ignores an older snapshot after changing the query', async () => {
  let resolve!: (value: CompanionFullTextSearchResults) => void;
  search.mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValueOnce(page(90, 1));
  begin();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'beta' } });
  await screen.findByText('Topic 90');
  await act(async () => resolve(page(20, 42)));
  await waitFor(() => expect(screen.queryByText('Topic 20')).not.toBeInTheDocument());
  expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
});
