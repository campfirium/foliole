import { screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, expect, it } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { installDemoRuntimeController, type DemoRuntimeController, type DemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';

import { WindowTitleBar } from './WindowTitleBar';

function installDemoState(isDemo: boolean) {
  const state: DemoRuntimeState = {
    clearError: null,
    importError: null,
    importedTopicCount: 0,
    isDemo,
    previewDay: 1
  };
  installDemoRuntimeController({
    clearLocalData: () => Promise.resolve(false),
    continueToNextPreviewDay: () => undefined,
    getNowIso: (realNow) => realNow.toISOString(),
    getState: () => state,
    importMarkdown: () => Promise.resolve({ ignoredCount: 0, importedTopicCount: 0 }),
    subscribe: () => () => undefined
  } satisfies DemoRuntimeController);
}

function renderTitleBar(overrides: Partial<ComponentProps<typeof WindowTitleBar>> = {}) {
  return renderWithLocalization(
    <WindowTitleBar
      activeRightPanelId="dev"
      centerTitle={null}
      isListCollapsed={false}
      isRightSidebarCollapsed={false}
      isTrashViewOpen={false}
      listWidth={320}
      onOpenTrashView={() => undefined}
      onSelectRightPanel={() => undefined}
      onToggleListVisibility={() => undefined}
      onToggleRightSidebarVisibility={() => undefined}
      rightSidebarWidth={320}
      {...overrides}
    />
  );
}

beforeEach(() => {
  installDemoState(false);
});

it('hides unavailable window controls in the Demo titlebar without keeping reserved width', () => {
  installDemoState(true);

  const { container } = renderTitleBar();
  const titlebar = container.querySelector<HTMLElement>('.window-titlebar');

  expect(screen.queryByRole('button', { name: 'Minimize' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Maximize' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  expect(titlebar?.style.getPropertyValue('--window-titlebar-controls-width')).toBe('0px');
});
