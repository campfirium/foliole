import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ run: vi.fn(), status: {
  automatic: true, observationThreshold: 30, usedBytes: 4096, eligibleBytes: 2048,
  trashBytes: 1024, trash: [{ storageKey: 'example.png' }]
} }));
vi.mock('../../../../shared/platform/attachments/attachmentMaintenance', () => ({ runAttachmentMaintenance: fixture.run }));

import { SettingsAttachmentStorageSection } from './SettingsAttachmentStorageSection';

beforeEach(() => {
  fixture.run.mockReset().mockImplementation(async request => {
    if (request.action === 'configure') Object.assign(fixture.status, request.settings);
    return { ...fixture.status };
  });
  Object.assign(fixture.status, { automatic: true, observationThreshold: 30 });
});

it('edits the mobile waiting period in a dialog, rejects invalid input and saves only on confirmation', async () => {
  const view = render(<SettingsAttachmentStorageSection mobile />);
  fireEvent.click(await screen.findByRole('button', { name: 'Cleanup waiting days 30 days' }));
  const dialog = await screen.findByRole('dialog');
  const input = within(dialog).getByRole('textbox', { name: 'Cleanup waiting days' });
  fireEvent.change(input, { target: { value: '0' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
  expect(within(dialog).getByRole('alert')).toBeInTheDocument();
  expect(fixture.run).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: '45' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(fixture.run).toHaveBeenCalledWith({ action: 'configure', settings: { automatic: true, observationThreshold: 45 } }));
  expect(await screen.findByRole('button', { name: 'Cleanup waiting days 45 days' })).toBeInTheDocument();
  view.unmount();
});

it('keeps moving to trash separate from confirmed permanent deletion', async () => {
  const view = render(<SettingsAttachmentStorageSection mobile />);
  fireEvent.click(await screen.findByRole('button', { name: 'Move to trash' }));
  await waitFor(() => expect(fixture.run).toHaveBeenCalledWith({ action: 'clean' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Empty trash' }));
  expect(fixture.run).not.toHaveBeenCalledWith({ action: 'empty-trash' });
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent(/permanently deletes/);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(fixture.run).not.toHaveBeenCalledWith({ action: 'empty-trash' });
  view.unmount();
});
