import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';

import { ReadwiseManualImportSection } from './ReadwiseManualImportSection';

const runtime = vi.hoisted(() => ({ prepare: vi.fn(), search: vi.fn(), adopt: vi.fn() }));
vi.mock('../../shared/platform/import/readwiseManualImportRuntimeRepository', () => ({
  prepareReadwiseManualSearchInRuntime: runtime.prepare,
  searchReadwiseManualSourcesInRuntime: runtime.search,
  importReadwiseManualSourceInRuntime: runtime.adopt
}));
beforeEach(() => {
  vi.clearAllMocks();
  runtime.prepare.mockResolvedValue({ status: 'ready', sources: [] });
  runtime.search.mockResolvedValue({ status: 'ready', sources: [] });
  runtime.adopt.mockResolvedValue({ status: 'imported', node_id: 'topic' });
});
function mount() { return render(<LocalizationProvider><ReadwiseManualImportSection /></LocalizationProvider>); }
async function submit(query: string) {
  const input = screen.getByRole('searchbox');
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.change(input, { target: { value: query } });
  fireEvent.submit(input.closest('form')!);
}

it('shows preparation without reporting an empty result, then keeps empty queries blank', async () => {
  let finish: (value: unknown) => void = () => undefined;
  runtime.prepare.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  mount();
  expect(screen.getByRole('searchbox')).toBeDisabled();
  expect(screen.getByPlaceholderText('Preparing search…')).toBeInTheDocument();
  expect(screen.queryByText('No matches')).not.toBeInTheDocument();
  await act(async () => { finish({ status: 'ready', sources: [] }); });
  await submit(' ');
  expect(runtime.search).not.toHaveBeenCalled();
  expect(screen.queryByText('No matches')).not.toBeInTheDocument();
});

it('searches while typing and separates import, explicit reimport, and protected sources', async () => {
  runtime.search.mockResolvedValue({ status: 'ready', sources: ['available', 'deleted', 'imported', 'suppressed'].map((status) => ({
    id: status, title: status, author: 'Writer', kind: 'article', status
  })) });
  mount();
  const input = screen.getByRole('searchbox');
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.change(input, { target: { value: 'Writer' } });
  await screen.findByText('available');
  expect(runtime.search).toHaveBeenCalledWith('Writer');
  expect(screen.getByRole('button', { name: 'Imported' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cannot import again' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Import again' }));
  await waitFor(() => expect(runtime.adopt).toHaveBeenCalledWith('deleted', true));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  await waitFor(() => expect(runtime.adopt).toHaveBeenCalledWith('available', false));
});

it('does not display stale results after the query changes while a request is pending', async () => {
  let finish: (value: unknown) => void = () => undefined;
  runtime.search.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  mount();
  await submit('old');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
  await act(async () => { finish({ status: 'ready', sources: [{ id: 'old', title: 'Old result', status: 'available' }] }); });
  expect(screen.queryByText('Old result')).not.toBeInTheDocument();
  expect(screen.queryByText('No matches')).not.toBeInTheDocument();
});
