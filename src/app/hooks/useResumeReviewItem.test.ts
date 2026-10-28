import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';

import { RESUME_REVIEW_UNAVAILABLE_NOTICE, useResumeReviewItem } from './useResumeReviewItem';

vi.mock('../../shared/ui/AppRuntimeNotice', () => ({ showAppRuntimeNotice: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

function setup(receipt: string | false, ready = true) {
  const resumeReviewSession = vi.fn().mockResolvedValue(receipt);
  const handleSelectNode = vi.fn();
  const controller = {
    externalView: { closeExternalView: vi.fn() }, nav: { handleSelectNode },
    runtime: { flushPendingEditorDraft: vi.fn(), setIsViewingTrashNode: vi.fn() },
    trash: { closeTrashView: vi.fn() }, virtualView: { closeVirtualView: vi.fn() }
  };
  const { result } = renderHook(() => useResumeReviewItem({ controller: controller as never,
    nowIso: '2026-03-10T12:00:00.000Z',
    reviewSettings: { isReviewSchedulerSettingsReady: ready, reviewSchedulerSettings: DEFAULT_REVIEW_SCHEDULER_SETTINGS } as never,
    ws: { reviewSessionMode: 'recommended', activeNodeId: 'stale-request', resumeReviewSession, nodeOrder: [], nodesById: {},
      reviewSession: { currentNodeId: 'stale-current', queueNodeIds: [] }, trashedNodeIds: [] } as never }));
  return { result, resumeReviewSession, handleSelectNode, controller };
}

it('navigates the committed current even when the renderer has no candidate list', async () => {
  const app = setup('service-current');
  await act(async () => { await app.result.current(); });
  expect(app.resumeReviewSession).toHaveBeenCalledWith('2026-03-10T12:00:00.000Z',
    expect.objectContaining({ preferredNodeId: 'stale-current' }));
  expect(app.handleSelectNode).toHaveBeenCalledWith('service-current', null, 'target-context');
  expect(app.controller.runtime.flushPendingEditorDraft).toHaveBeenCalledOnce();
});

it('keeps navigation unchanged when the service finds no current', async () => {
  const app = setup(false);
  await act(async () => { await app.result.current(); });
  expect(app.resumeReviewSession).toHaveBeenCalledOnce();
  expect(app.handleSelectNode).not.toHaveBeenCalled();
  expect(showAppRuntimeNotice).toHaveBeenCalledWith(RESUME_REVIEW_UNAVAILABLE_NOTICE);
});

it('waits for settings before asking the service', async () => {
  const app = setup('service-current', false);
  await act(async () => { await app.result.current(); });
  expect(app.resumeReviewSession).not.toHaveBeenCalled();
  expect(app.handleSelectNode).not.toHaveBeenCalled();
});
