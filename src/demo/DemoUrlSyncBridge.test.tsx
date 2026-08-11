import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { LocalizationProvider, useLocalization } from '../shared/localization/LocalizationProvider';
import { preloadTranslationCatalog } from '../shared/localization/translations';
import { createInitialWorkspaceState, useWorkspaceStore } from '../store/workspaceStore';

import { DEFAULT_DEMO_TOPIC, getDemoTopicNodeId } from './demoContent';
import { DemoUrlSyncBridge } from './DemoUrlSyncBridge';

const DEMO_TOPIC = DEFAULT_DEMO_TOPIC;

if (!DEMO_TOPIC) {
  throw new Error('Demo URL sync bridge test requires one topic.');
}

function LanguageSwitchHarness() {
  const { setLanguagePreference } = useLocalization();
  return (
    <button onClick={() => setLanguagePreference('de')} type="button">
      Switch
    </button>
  );
}

beforeAll(async () => {
  await preloadTranslationCatalog('en');
  await preloadTranslationCatalog('zh-Hans');
});

beforeEach(() => {
  window.history.replaceState(null, '', `/en/guides/${DEMO_TOPIC.slug}/`);
  useWorkspaceStore.setState({
    ...createInitialWorkspaceState(new Date('2026-06-17T00:00:00.000Z')),
    activeNodeId: getDemoTopicNodeId(DEMO_TOPIC)
  });
});

it('keeps explicit Demo language changes on refresh-safe published URLs', async () => {
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
      '/en/demo/?lang=de'
    );
  });
  replaceState.mockRestore();
});
