import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionShareInboxNotice } from './CompanionShareInboxNotice';

const runtime = vi.hoisted(() => ({ consume: vi.fn(), listen: vi.fn(), remove: vi.fn() }));
vi.mock('./companionShareInboxRuntime', () => ({
  consumeCompanionShareInbox: runtime.consume,
  listenForCompanionShares: runtime.listen
}));
const workspace = { isWorkspaceSyncStateReady: true, state: { workspace_snapshot: {} } } as never;
function renderInbox() {
  return renderWithLocalization(<CompanionShareInboxNotice workspaceSync={workspace}><p>Workspace</p></CompanionShareInboxNotice>);
}
beforeEach(() => {
  vi.resetAllMocks();
  runtime.consume.mockResolvedValue(undefined);
  runtime.listen.mockResolvedValue({ remove: runtime.remove });
  runtime.remove.mockResolvedValue(undefined);
});

it('shows a failed delivery and lets the user retry without reopening the app', async () => {
  runtime.consume.mockRejectedValueOnce(new Error('save, refresh or ack failed'));
  renderInbox();
  expect(await screen.findByRole('alert')).toHaveTextContent('Sharing could not be completed. Try again.');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(runtime.consume).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Workspace')).toBeInTheDocument();
});

it('dismisses only the notice and consumes again on the next native delivery event', async () => {
  runtime.consume.mockRejectedValueOnce(new Error('ack failed'));
  renderInbox();
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(runtime.consume).toHaveBeenCalledTimes(1);
  await act(async () => runtime.listen.mock.calls[0]![0]());
  expect(runtime.consume).toHaveBeenCalledTimes(2);
});

it('removes a late native listener when its surface has already unmounted', async () => {
  let attach!: (value: { remove: typeof runtime.remove }) => void;
  runtime.listen.mockReturnValue(new Promise((resolve) => { attach = resolve; }));
  const ui = renderInbox();
  ui.unmount();
  await act(async () => attach({ remove: runtime.remove }));
  expect(runtime.remove).toHaveBeenCalledTimes(1);
  await act(async () => runtime.listen.mock.calls[0]![0]());
  expect(runtime.consume).toHaveBeenCalledTimes(1);
});
