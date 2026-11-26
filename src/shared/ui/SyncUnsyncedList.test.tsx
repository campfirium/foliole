import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { SyncUnsyncedViewItem } from '../../../lib/core/sync/syncUnsyncedView';

import { SyncItemNavigationContext } from './SyncItemNavigationContext';
import { SyncUnsyncedList } from './SyncUnsyncedList';

const item = (globalId: string, title: string | null, peerDeviceId = 'phone'): SyncUnsyncedViewItem => ({
  objectType: 'node', globalId, title, peerDeviceId, code: 'sync_item_constraint_failed', side: 'peer',
  stage: 'apply', firstSeenAt: '2026-11-26T00:00:00.000Z'
});

it('opens only items this device holds and copies identities without titles', async () => {
  const open = vi.fn();
  const copyText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
  render(
    <SyncItemNavigationContext.Provider value={open}>
      <SyncUnsyncedList copyText={copyText} deviceNames={{ phone: 'My phone' }} loadAppVersion={async () => '1.2.3'}
        items={[item('local-id', 'Private title'), item('remote-id', null), item('left-id', 'Gone', 'removed')]} />
    </SyncItemNavigationContext.Provider>
  );
  expect(screen.getByRole('heading').textContent).toBe('Not synced: 2');
  fireEvent.click(screen.getByRole('button', { name: 'Private title' }));
  expect(open).toHaveBeenCalledWith('local-id');
  expect(screen.queryByRole('button', { name: 'Not on this device' })).toBeNull();
  expect(screen.queryByText('Gone')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Copy all' }));
  await waitFor(() => expect(copyText).toHaveBeenCalled());
  const report = copyText.mock.calls[0]![0];
  expect(report).toContain('Foliole 1.2.3');
  expect(report).toContain('id=local-id code=sync_item_constraint_failed');
  expect(report).toContain('id=remote-id');
  expect(report).not.toContain('Private title');
  expect(report).not.toContain('left-id');
});

it('shows nothing when every item synced', () => {
  const view = render(<SyncUnsyncedList copyText={async () => undefined} deviceNames={{ phone: 'My phone' }}
    items={[]} loadAppVersion={async () => '1'} />);
  expect(view.container.textContent).toBe('');
});
