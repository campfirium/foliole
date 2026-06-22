import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { installDemoRuntimeController, type DemoRuntimeController, type DemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';

import { DEMO_DESKTOP_MIN_WIDTH_PX, WorkspaceDemoViewportGate } from './WorkspaceDemoViewportGate';

function installDemoState(isDemo: boolean) {
  const state: DemoRuntimeState = {
    clearError: null,
    importError: null,
    importedTopicCount: 0,
    isDemo,
    manualAdvanceDays: 0,
    previewDay: 1,
    startedAt: null
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

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  fireEvent(window, new Event('resize'));
}

beforeEach(() => {
  installDemoState(false);
  setViewportWidth(DEMO_DESKTOP_MIN_WIDTH_PX);
});

it('passes through the workspace outside Demo', () => {
  setViewportWidth(390);

  renderWithLocalization(<WorkspaceDemoViewportGate><div>Workspace</div></WorkspaceDemoViewportGate>);

  expect(screen.getByText('Workspace')).toBeInTheDocument();
  expect(screen.queryByText('Use a wider window for the Demo workspace')).toBeNull();
});

it('shows a desktop-width prompt for narrow Demo viewports', () => {
  installDemoState(true);
  setViewportWidth(DEMO_DESKTOP_MIN_WIDTH_PX - 1);

  renderWithLocalization(<WorkspaceDemoViewportGate><div>Workspace</div></WorkspaceDemoViewportGate>);

  expect(screen.queryByText('Workspace')).toBeNull();
  expect(screen.getByRole('main', { name: 'Demo desktop width notice' })).toBeInTheDocument();
  expect(screen.getByText('Use a wider window for the Demo workspace')).toBeInTheDocument();
});
