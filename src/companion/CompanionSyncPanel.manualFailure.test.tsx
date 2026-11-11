import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSettingsList } from './CompanionSettingsContent';
import { CompanionSyncPanel } from './CompanionSyncPanel';
import { CompanionSyncProtocolNotice } from './CompanionSyncProtocolNotice';

vi.mock('../shared/platform/companion/sync/companionWebDavRelayStore', () => ({
  loadCompanionWebDavStatus: vi.fn().mockResolvedValue({ enabled: true, authenticationStatus: undefined }),
  subscribeCompanionWebDavRelay: () => () => undefined
}));

const preview = vi.hoisted(() => ({ labelKey: 'settings.companionSync.webdav.title', visibility: 'internal' }));

vi.mock('../shared/config/featurePreviews.json', () => ({ default: { webdavSyncSettings: preview } }));

beforeEach(() => {
  window.localStorage.clear();
  preview.visibility = 'internal';
});
afterEach(() => vi.unstubAllEnvs());

function renderConnectedSettings() {
  return renderWithLocalization(
    <>
      <CompanionSettingsList
        onOpenAppearance={vi.fn()}
        onOpenAttachments={vi.fn()}
        onOpenBackup={vi.fn()}
        onOpenDebug={vi.fn()}
        onOpenSync={vi.fn()}
        showStorage={false}
      />
      <CompanionSyncPanel
        bootstrapState={{
          booted_at: '', database_path: null, database_ready: true, device_id: 'device-1',
          runtime_kind: 'ios-capacitor'
        }}
        discoveries={[]}
        endpointUrl="http://desktop:38641"
        error="discovery_no_devices"
        joinRequest={null}
        joinStatus="idle"
        lastSyncedAt={null}
        manualSyncAction={{
          runId: 'offline-run', started: true, status: 'terminal', terminalResult: 'failed'
        }}
        rememberedTargets={[]}
        syncConflictCount={0}
        syncEvents={[]}
        syncProgress={null}
        syncGroup={{
          created_at: '', devices: [], display_name: 'Studio', group_id: 'group-1',
          local_device_identity_key: 'device-1'
        }}
        onCancelJoin={vi.fn()}
        onClearError={vi.fn()}
        onDiscover={vi.fn()}
        onLeaveSyncGroup={vi.fn()}
        onOpenSettingsPage={vi.fn()}
        onPull={vi.fn()}
        onRemoveRememberedTarget={vi.fn()}
        onRequestJoin={vi.fn()}
        onSaveEndpoint={vi.fn()}
        page="sync"
        status="idle"
      />
    </>
  );
}

it.each([
  ['internal', true], ['production', false]
])('shows the sync result and applies %s visibility to WebDAV status', async (mode, visible) => {
  vi.stubEnv('MODE', mode);
  renderConnectedSettings();

  expect(screen.queryByRole('button', { name: /handoff/i })).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Sync failed.');
  if (visible) expect(await screen.findByText('WebDAV enabled')).toBeVisible();
  else expect(screen.queryByText('WebDAV enabled')).not.toBeInTheDocument();
  expect(screen.queryByText('Waiting for a desktop Sync anchor.')).not.toBeInTheDocument();
  expect(screen.queryByTestId('companion-sync-error')).not.toBeInTheDocument();
});

it('updates the companion Sync screen when an experiment is enabled or disabled', async () => {
  vi.stubEnv('MODE', 'production');
  preview.visibility = 'experimental';
  renderConnectedSettings();
  const toggle = screen.getByRole('switch', { name: 'WebDAV relay' });

  expect(screen.queryByText('WebDAV enabled')).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(await screen.findByText('WebDAV enabled')).toBeVisible();
  fireEvent.click(toggle);
  expect(screen.queryByText('WebDAV enabled')).not.toBeInTheDocument();
});

it.each(['protocol_incompatible', 'framed_sync_http_400:framed_sync_protocol_version_unsupported'])(
  'shows an independent protocol notice while keeping the sync failure: %s', error => {
  renderWithLocalization(
    <CompanionSyncProtocolNotice error={error}><CompanionSyncPanel
      bootstrapState={{ booted_at: '', database_path: null, database_ready: true,
        device_id: 'device-1', runtime_kind: 'ios-capacitor' }}
      discoveries={[]}
      endpointUrl="http://desktop:38641"
      error="protocol_incompatible"
      joinRequest={null}
      joinStatus="idle"
      lastSyncedAt={null}
      rememberedTargets={[]}
      syncConflictCount={0}
      syncEvents={[]}
      syncProgress={null}
      syncGroup={null}
      onCancelJoin={vi.fn()}
      onClearError={vi.fn()}
      onDiscover={vi.fn()}
      onLeaveSyncGroup={vi.fn()}
      onOpenSettingsPage={vi.fn()}
      onPull={vi.fn()}
      onRemoveRememberedTarget={vi.fn()}
      onRequestJoin={vi.fn()}
      onSaveEndpoint={vi.fn()}
      page="sync"
      status="idle"
    /></CompanionSyncProtocolNotice>
  );

  expect(screen.getByRole('dialog', { name: 'Cannot sync' }))
    .toHaveTextContent('The devices use incompatible sync versions.');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: 'Cannot sync' })).not.toBeInTheDocument();
  expect(screen.getByTestId('companion-sync-error')).toHaveTextContent('Update Foliole');
});
