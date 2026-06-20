import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { installDemoRuntimeController, type DemoRuntimeController, type DemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';

import { WorkspaceDemoControlsSurface } from './WorkspaceDemoControlsSurface';

const continueToNextPreviewDay = vi.fn();

function installDemoState(isDemo: boolean) {
  const state: DemoRuntimeState = {
    clearError: null,
    importError: null,
    importedTopicCount: 0,
    isDemo,
    previewDay: 2
  };
  installDemoRuntimeController({
    clearLocalData: () => Promise.resolve(false),
    continueToNextPreviewDay,
    getNowIso: (realNow) => realNow.toISOString(),
    getState: () => state,
    importMarkdown: () => Promise.resolve({ ignoredCount: 0, importedTopicCount: 0 }),
    subscribe: () => () => undefined
  } satisfies DemoRuntimeController);
}

beforeEach(() => {
  continueToNextPreviewDay.mockClear();
  installDemoState(false);
});

it('does not render outside the Demo runtime', () => {
  renderWithLocalization(
    <WorkspaceDemoControlsSurface flowWindow={{ queueNodeIds: [], readyNodeIds: [], upcomingNodeIds: ['topic-1'] }} />
  );

  expect(screen.queryByRole('region', { name: 'Demo controls' })).toBeNull();
});

it('renders Demo controls as an independent surface and keeps the runtime action', () => {
  installDemoState(true);

  renderWithLocalization(
    <WorkspaceDemoControlsSurface flowWindow={{ queueNodeIds: [], readyNodeIds: [], upcomingNodeIds: ['topic-1'] }} />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Continue to Day 3' }));

  expect(screen.getByRole('region', { name: 'Demo controls' })).toBeInTheDocument();
  expect(screen.getByText('Day 2 is clear. Continue the preview to see what comes back next.')).toBeInTheDocument();
  expect(continueToNextPreviewDay).toHaveBeenCalledTimes(1);
});
