import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { CompanionSyncGroupJoinRequests } from './CompanionSyncGroupJoinRequests';

it('keeps the inactive companion request surface on Sync Group and Device language', () => {
  render(<CompanionSyncGroupJoinRequests onAccept={vi.fn()} onReject={vi.fn()} requests={[{
    device_name: 'MacBook', platform: 'macOS', request_id: 'request-a'
  }]} />);
  expect(screen.getByText('MacBook wants to join this Sync Group.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
  expect(document.body.textContent ?? '').not.toMatch(/pair|member|manager|connect|revoke/iu);
});
