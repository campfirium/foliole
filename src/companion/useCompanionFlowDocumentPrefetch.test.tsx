import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession';
import { prepareCompanionFlowArticle } from '../shared/platform/companion/reading/companionArticlePreparation';
import { predictCompanionFlowDocument } from '../shared/platform/companion/runtime/companionDailyFlow';
import type { CompanionReadIntents } from '../shared/platform/companion/runtime/companionReadIntents';

import { useCompanionFlowDocumentPrefetch } from './useCompanionFlowDocumentPrefetch';

vi.mock('../shared/platform/companion/reading/companionArticlePreparation', () => ({ prepareCompanionFlowArticle: vi.fn() }));
vi.mock('../shared/platform/companion/runtime/companionDailyFlow', () => ({ predictCompanionFlowDocument: vi.fn() }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('prepares the next Dive body from the Dive position instead of the global read window', async () => {
  vi.mocked(predictCompanionFlowDocument).mockResolvedValue('next');
  const snapshot = { nodesById: {} } as WorkspaceSnapshot;
  const dive = { id: 'dive', position: 1 };
  const session = { flowFormat: 'cycle-v1', currentNodeId: 'current', queueNodeIds: [], dive,
    daily: { scope: 'library', dayKey: 'day', revision: 1 } } as unknown as DailyFlowSession;
  const prepare = vi.fn();
  const engine = { displayPreparation: { prepare } } as unknown as CompanionReadIntents;
  renderHook(() => useCompanionFlowDocumentPrefetch(snapshot, session, engine, 'recommended'));
  await waitFor(() => expect(prepareCompanionFlowArticle).toHaveBeenLastCalledWith(snapshot, 'next', 'current'));
  expect(predictCompanionFlowDocument).toHaveBeenCalledWith(expect.objectContaining({ currentNodeId: 'current', dive }),
    expect.any(AbortSignal));
  expect(prepare).not.toHaveBeenCalled();
});
