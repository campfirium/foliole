import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { requestAppConfirmation } from '../../shared/ui/appConfirmation';
import { AppConfirmationProvider } from '../../shared/ui/AppConfirmationProvider';

const runtime = vi.hoisted(() => ({ load: vi.fn(), resolve: vi.fn(), select: vi.fn() }));
vi.mock('../../shared/platform/runtime', () => ({ isDesktopRuntime: () => true }));
vi.mock('../../shared/platform/desktopSyncGroupRuntimeRepository', () => ({
  onDesktopSyncGroupOverviewChanged: () => () => undefined
}));
vi.mock('../../shared/platform/import/readwiseHostAssignmentRuntimeRepository', () => ({
  loadReadwiseHostAssignmentFromRuntime: runtime.load,
  resolveReadwiseJoinDecisionInRuntime: runtime.resolve,
  selectReadwiseImportDeviceInRuntime: runtime.select
}));

import { ReadwiseImportDeviceDialog } from './ReadwiseImportDeviceDialog';

beforeEach(() => {
  runtime.load.mockReset(); runtime.resolve.mockReset(); runtime.select.mockReset();
  runtime.load.mockResolvedValue({ active_device_identity_key: null });
  runtime.resolve.mockResolvedValue({ kind: 'choose', devices: [
    { device_id: 'mac', device_name: 'Mac Mini' },
    { device_id: 'win', device_name: 'Windows PC' }
  ] });
  runtime.select.mockResolvedValue({ is_active: true });
});

it('shows both dynamic device names and sends the selected stable identity', async () => {
  renderWithLocalization(<ReadwiseImportDeviceDialog />);
  const windows = await screen.findByRole('button', { name: 'Windows PC' });
  expect(screen.getByRole('button', { name: 'Mac Mini' })).toBeInTheDocument();
  fireEvent.click(windows);
  await waitFor(() => expect(runtime.select).toHaveBeenCalledWith('win'));
});

it('does not ask again when the group already has an import device', async () => {
  runtime.resolve.mockResolvedValue({ kind: 'none', devices: [] });
  renderWithLocalization(<ReadwiseImportDeviceDialog />);
  await waitFor(() => expect(runtime.resolve).toHaveBeenCalledOnce());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('keeps restoration and device notices separate and shows only one at a time', async () => {
  const view = renderWithLocalization(<AppConfirmationProvider><div>Workspace</div></AppConfirmationProvider>);
  act(() => { void requestAppConfirmation({ title: 'Backup restored', confirmLabel: 'Done' }); });
  view.rerender(<AppConfirmationProvider><ReadwiseImportDeviceDialog /></AppConfirmationProvider>);
  await waitFor(() => expect(runtime.resolve).toHaveBeenCalledOnce());
  expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(1);
  expect(screen.getByRole('dialog')).toHaveTextContent('Backup restored');
  expect(runtime.select).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(await screen.findByRole('button', { name: 'Windows PC' })).toBeVisible();
  expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Windows PC' }));
  await waitFor(() => expect(runtime.select).toHaveBeenCalledWith('win'));
});
