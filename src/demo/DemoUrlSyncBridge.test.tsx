import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { LocalizationProvider, useLocalization } from '../shared/localization/LocalizationProvider';
import { preloadTranslationCatalog } from '../shared/localization/translations';
import { useWorkspaceStore } from '../store/workspaceStore';

import { DEFAULT_DEMO_TOPIC, getDemoTopicNodeId } from './demoContent';
import { DemoUrlSyncBridge } from './DemoUrlSyncBridge';
import { createDemoWorkspaceSnapshot } from './demoWorkspaceSnapshot';

const DEMO_TOPIC = DEFAULT_DEMO_TOPIC;

if (!DEMO_TOPIC) {
  throw new Error('Demo URL sync bridge test requires one topic.');
}

function LanguageSwitchHarness() {
  const { setLanguagePreference } = useLocalization();
  return (
    <button onClick={() => setLanguagePreference('zh-Hans')} type="button">
      Switch
    </button>
  );
}

beforeAll(async () => {
  await preloadTranslationCatalog('en');
  await preloadTranslationCatalog('zh-Hans');
});

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/en/demo/');
  useWorkspaceStore.setState(createDemoWorkspaceSnapshot('/en/demo/', new Date('2026-06-17T00:00:00.000Z')));
});

it('switches the published URL and seeded Demo content without a refresh', async () => {
  const replaceState = vi.spyOn(window.history, 'replaceState');

  render(
    <LocalizationProvider initialLanguagePreference="en">
      <DemoUrlSyncBridge />
      <LanguageSwitchHarness />
    </LocalizationProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Switch' }));

  await waitFor(() => {
    expect(replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/zh-hans/demo/'
    );
    expect(useWorkspaceStore.getState().nodesById[getDemoTopicNodeId(DEMO_TOPIC)]?.title).toBe('欢迎使用 Foliole');
  });
  replaceState.mockRestore();
});
