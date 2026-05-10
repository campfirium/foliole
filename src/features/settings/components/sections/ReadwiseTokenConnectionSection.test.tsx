import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { ReadwiseTokenConnectionSection } from './ReadwiseTokenConnectionSection';
import type { useReadwiseTokenConnection } from './useReadwiseTokenConnection';

const readwiseTokenMock = vi.hoisted(() => ({
  useReadwiseTokenConnection: vi.fn()
}));

vi.mock('./useReadwiseTokenConnection', () => readwiseTokenMock);

type ReadwiseTokenState = ReturnType<typeof useReadwiseTokenConnection>;

function createState(overrides: Partial<ReadwiseTokenState> = {}): ReadwiseTokenState {
  return {
    connect: vi.fn(),
    connection: {
      checked_at: '2026-05-10T00:00:00.000Z',
      connected: true,
      message: 'Readwise token is saved on this device.',
      status: 'connected'
    },
    disconnect: vi.fn(),
    error: null,
    isPending: false,
    pendingAction: null,
    sync: vi.fn(),
    syncResult: null,
    ...overrides
  };
}

beforeEach(() => {
  readwiseTokenMock.useReadwiseTokenConnection.mockReturnValue(createState());
});

it('shows an active sync state when Readwise sync is running', () => {
  readwiseTokenMock.useReadwiseTokenConnection.mockReturnValue(createState({
    isPending: true,
    pendingAction: 'sync'
  }));

  render(<ReadwiseTokenConnectionSection />);

  expect(screen.getByText('Syncing Readwise library.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Syncing...' })).toBeDisabled();
});

it('shows a visible Readwise sync result after sync completes', () => {
  readwiseTokenMock.useReadwiseTokenConnection.mockReturnValue(createState({
    syncResult: {
      checked_at: '2026-05-10T00:00:00.000Z',
      document_count: 5,
      has_more: false,
      message: 'Readwise sync finished; updated 5 of 5 library documents.',
      page_count: 1,
      retry_after_seconds: null,
      source_count: 5,
      status: 'synced'
    }
  }));

  render(<ReadwiseTokenConnectionSection />);

  expect(screen.getByText('Readwise sync finished; updated 5 of 5 library documents.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sync library' })).toBeEnabled();
});
