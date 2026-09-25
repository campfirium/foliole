import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

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
