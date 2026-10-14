import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ post: vi.fn(), render: vi.fn() }));
vi.mock('@capacitor/app', () => ({ App: { addListener: async () => ({ remove: async () => undefined }) } }));
vi.mock('react-dom/client', () => ({ default: { createRoot: () => ({ render: mocks.render }) } }));
vi.mock('../shared/platform/companionBootstrap', () => ({
  loadCompanionBootstrapState: async () => ({ database_path: '/test-library' })
}));
vi.mock('../shared/platform/companionWorkspaceSync', () => ({ saveCompanionWorkspaceSyncEndpoint: async () => undefined }));
vi.mock('./iosAcceptanceSyncGroup', () => ({ ensureIosAcceptanceSyncGroup: async () => ({ endpointUrl: 'http://provider' }) }));
vi.mock('./iosBridgeAcceptance', () => ({ postResult: mocks.post }));
vi.mock('./useCompanionWorkspaceSync', async () => {
  const { useTranslation } = await import('../shared/localization/LocalizationProvider');
  return { useCompanionWorkspaceSync: () => {
    useTranslation();
    return { isWorkspaceSyncStateReady: false, state: { endpoint_url: null, last_synced_at: null },
      syncGroupJoined: true, status: 'loading', error: null,
      syncParticipation: { hydrated: false, sync_enabled: true, sync_paused: false } };
  } };
});

import { runIosForegroundSyncLifecycleAcceptance } from './iosForegroundSyncLifecycleAcceptance';

it('renders the foreground sync shell with the localization context required by its sync hook', async () => {
  mocks.render.mockImplementation(element => renderToStaticMarkup(element));
  await runIosForegroundSyncLifecycleAcceptance(document.createElement('div'));
  expect(mocks.render).toHaveBeenCalledOnce();
  expect(mocks.post).toHaveBeenCalledWith(expect.objectContaining({ stage: 'listeners-installed' }));
  expect(mocks.post).not.toHaveBeenCalledWith(expect.objectContaining({ phase: 'failed' }));
});
