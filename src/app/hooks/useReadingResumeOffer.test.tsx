import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { NativeReadingResumeContext } from '../../../lib/platform/nativeReadingProgressContract';
import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';
import type { WorkspaceSyncAppliedPayload } from '../../shared/platform/electronApi';
import { WorkspaceRuntimeNotice } from '../components/WorkspaceRuntimeNotice';

import { useReadingResumeOffer } from './useReadingResumeOffer';

const bridge = vi.hoisted(() => ({
  load: vi.fn(),
  subscribe: vi.fn()
}));
vi.mock('../../shared/platform/runtimeShellEvents', () => ({ onWorkspaceSyncApplied: bridge.subscribe }));
vi.mock('../../shared/platform/workspaceRuntimeRepository', () => ({ loadReadingResumeFromRuntime: bridge.load }));

function setup() {
  const runtime = {
    editorRef: { current: { getPrimaryVisiblePosition: () => 1000 } },
    readingResumeContextRef: { current: null as NativeReadingResumeContext | null },
    readingResumeMovedNodeIdRef: { current: null },
    readingPositionRef: { current: null },
    readingPositionRestoreCommandRef: { current: null },
    readingPositionRestoreCommandSeqRef: { current: 0 },
    readingPositionSyncRef: { current: null },
    bumpReadingPositionRequest: vi.fn()
  };
  const unlisten = vi.fn();
  let listener: (payload: WorkspaceSyncAppliedPayload) => void = () => undefined;
  bridge.subscribe.mockImplementation(async (callback: typeof listener) => {
    listener = callback;
    return unlisten;
  });
  function Offer({ nodeId }: { nodeId: string }) {
    useReadingResumeOffer(nodeId, runtime as never);
    return <WorkspaceRuntimeNotice />;
  }
  const view = render(<Offer nodeId="a" />, { wrapper: LocalizationProvider });
  const sync = async (nodeId: string, offset: number) => {
    bridge.load.mockResolvedValue({ nodeId, contentHash: 'a'.repeat(64), libraryEpoch: 'library', clock: { B: 1 }, offset });
    await act(async () => listener({ appliedNodeIds: [], appliedReviewOpIds: [],
      appliedObjectIds: [`node_reading_resume:${nodeId}`] }));
  };
  return { runtime, view, sync, Offer, unlisten };
}

afterEach(() => vi.clearAllMocks());

it('offers only a farther position for the open article and jumps only when selected', async () => {
  const { runtime, sync } = setup();
  await sync('b', 4000);
  expect(bridge.load).not.toHaveBeenCalled();
  await sync('a', 500);
  expect(screen.queryByTestId('app-runtime-notice')).toBeNull();
  await sync('a', 4000);
  expect(runtime.bumpReadingPositionRequest).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Jump to position' }));
  expect(runtime.readingResumeContextRef.current).toMatchObject({ offset: 4000, clock: { B: 1 } });
  expect(runtime.readingPositionRestoreCommandRef.current).toMatchObject({
    nodeId: 'a', command: { targetViewportMode: 'reading-position', selection: { from: 4000, to: 4000 } }
  });
});

it('clears an ignored offer on leaving without changing the reading context or moving the editor', async () => {
  const { runtime, view, sync, Offer } = setup();
  await sync('a', 4000);
  expect(screen.getByRole('button', { name: 'Jump to position' })).toBeInTheDocument();
  view.rerender(<Offer nodeId="b" />);
  expect(screen.queryByTestId('app-runtime-notice')).toBeNull();
  expect(runtime.readingResumeContextRef.current).toBeNull();
  expect(runtime.bumpReadingPositionRequest).not.toHaveBeenCalled();
});

it('keeps the current view when the synced position belongs to different text', async () => {
  const { runtime, sync } = setup();
  runtime.readingResumeContextRef.current = {
    nodeId: 'a', contentHash: 'b'.repeat(64), libraryEpoch: 'library', clock: {}, offset: null
  };
  await sync('a', 4000);
  expect(screen.queryByTestId('app-runtime-notice')).toBeNull();
  expect(runtime.bumpReadingPositionRequest).not.toHaveBeenCalled();
});
