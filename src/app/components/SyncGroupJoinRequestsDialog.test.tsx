import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { SyncGroupJoinRequestsDialog } from './SyncGroupJoinRequestsDialog';

it('presents one Device join request without legacy product objects', () => {
  render(<SyncGroupJoinRequestsDialog onAccept={vi.fn()} onReject={vi.fn()} requests={[{
    device_name: 'Reading phone', platform: 'Android', request_id: 'request-a'
  }]} />);
  expect(screen.getByText('Join request')).toBeInTheDocument();
  expect(screen.getByText('Reading phone wants to join this Sync Group.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
  const copy = document.body.textContent ?? '';
  expect(copy).not.toMatch(/pair|member|manager|connect|short code|revoke/iu);
});
