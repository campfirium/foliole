import { screen } from '@testing-library/react';
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
    <WorkspaceDemoControlsSurface flowWindow={{ dayBuckets: [{ dayOffset: 1, nodeIds: ['topic-1'] }], queueNodeIds: [], readyNodeIds: [], upcomingNodeIds: ['topic-1'] }} />
  );

  expect(screen.queryByLabelText('Demo Flow notice')).toBeNull();
});

it('renders a buttonless Demo day-clear notice when later day content exists', () => {
  installDemoState(true);

  renderWithLocalization(
    <WorkspaceDemoControlsSurface flowWindow={{ dayBuckets: [{ dayOffset: 1, nodeIds: ['topic-1'] }], queueNodeIds: [], readyNodeIds: [], upcomingNodeIds: ['topic-1'] }} />
  );

  expect(screen.getByLabelText('Demo Flow notice')).toBeInTheDocument();
  expect(screen.getByText('Day 3 content is clear.')).toBeInTheDocument();
  expect(screen.getByText('Keep browsing to see what comes back later, or come back tomorrow.')).toBeInTheDocument();
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByText('Clear local data')).toBeNull();
  expect(continueToNextPreviewDay).not.toHaveBeenCalled();
});
