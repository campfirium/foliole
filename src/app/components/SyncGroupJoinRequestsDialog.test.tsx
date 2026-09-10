import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

const { useDesktopSyncGroup } = vi.hoisted(() => ({ useDesktopSyncGroup: vi.fn() }));

vi.mock('../../shared/platform/useDesktopSyncGroup', () => ({ useDesktopSyncGroup }));

import { SyncGroupJoinRequestsDialog } from './SyncGroupJoinRequestsDialog';

beforeEach(() => {
  useDesktopSyncGroup.mockReset();
});

it('places sync join decisions in the shared dialog action band', async () => {
  const acceptRequest = vi.fn(async () => undefined);
  const rejectRequest = vi.fn(async () => undefined);
  useDesktopSyncGroup.mockReturnValue({
    acceptRequest,
    isDesktopRuntime: true,
    overview: {
      join_requests: [{ device_name: 'Reading phone', platform: 'Android', request_id: 'request-1' }]
    },
    pendingActionId: null,
    rejectRequest
  });

  renderWithLocalization(<SyncGroupJoinRequestsDialog />);

  const dialog = screen.getByRole('dialog');
  expect(screen.getByRole('heading')).toHaveAttribute('data-app-dialog-title', 'true');
  expect(dialog).toHaveTextContent('Reading phone');
  const approve = screen.getByRole('button', { name: /Approve|允许/ });
  const reject = screen.getByRole('button', { name: /Decline|拒绝/ });
  expect(approve.closest('[data-app-dialog-actions]')).toContainElement(reject);

  fireEvent.click(approve);
  await waitFor(() => expect(acceptRequest).toHaveBeenCalledWith('request-1'));
});
