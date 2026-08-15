import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { clearAppRuntimeNotice, showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';

import { WorkspaceRuntimeNotice } from './WorkspaceRuntimeNotice';

let noticeId: number | null = null;

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  if (noticeId) clearAppRuntimeNotice(noticeId);
  noticeId = null;
  vi.useRealTimers();
});

it('announces a Trash-row undo without rendering a floating notice', () => {
  noticeId = showAppRuntimeNotice(
    'Topic moved to Trash',
    'success',
    { label: 'Undo', onSelect: vi.fn() },
    { durationMs: 8000, presentation: 'trash-row' }
  );
  render(<WorkspaceRuntimeNotice />);

  const status = screen.getByRole('status');
  expect(status).toHaveTextContent('Topic moved to Trash');
  expect(status).toHaveClass('sr-only');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('expires the Trash-row undo after its internal duration', () => {
  noticeId = showAppRuntimeNotice(
    'Topic moved to Trash',
    'success',
    { label: 'Undo', onSelect: vi.fn() },
    { durationMs: 8000, presentation: 'trash-row' }
  );
  render(<WorkspaceRuntimeNotice />);

  act(() => vi.advanceTimersByTime(7999));
  expect(screen.getByRole('status')).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  noticeId = null;
});
