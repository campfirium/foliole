import { act, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const statusMocks = vi.hoisted(() => ({
  listener: null as ((status: { status: 'failed' | 'ready' | 'rebuilding'; strategy: 'word-based' }) => void) | null,
  load: vi.fn(),
  subscribe: vi.fn((listener) => {
    statusMocks.listener = listener;
    return () => { statusMocks.listener = null; };
  })
}));

vi.mock('../../shared/platform/searchIndexRebuildStatus', () => ({
  loadSearchIndexRebuildStatus: statusMocks.load,
  onSearchIndexRebuildStatus: statusMocks.subscribe
}));

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { SearchPaletteIndexStatus } from './SearchPaletteIndexStatus';

beforeEach(() => {
  vi.clearAllMocks();
  statusMocks.listener = null;
});

it('shows failed coverage without a spinner and clears the message when indexing becomes ready', async () => {
  statusMocks.load.mockResolvedValue({ status: 'failed', strategy: 'word-based' });
  renderWithLocalization(<SearchPaletteIndexStatus isOpen />);

  expect(await screen.findByText('Some topics may be missing because search data could not be updated.')).toBeInTheDocument();
  expect(screen.queryByText(/still being updated/i)).not.toBeInTheDocument();

  act(() => statusMocks.listener?.({ status: 'ready', strategy: 'word-based' }));
  expect(screen.queryByText(/Some topics may be missing/)).not.toBeInTheDocument();
});
