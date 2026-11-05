import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { companionWorkspaceSnapshots } from '../shared/platform/companion/companionWorkspaceSnapshotStore';
import { getCompanionReadIntents } from '../shared/platform/companion/runtime/companionReadIntents';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';

import { useDailyFlowSurface } from './companionFlowDay.testSupport';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
afterEach(async () => { cleanup(); vi.restoreAllMocks(); await library?.close(); });

it('publishes learning from its receipt without another workspace read or Flow writer transaction', async () => {
  library = await createSearchLibrary(3, 16);
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const ui = renderHook(() => useDailyFlowSurface(initial));
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toBeTruthy());
  const engine = await getCompanionReadIntents();
  const source = ui.result.current.surface.readableArticle!.nodeId;
  const transactions: string[][] = [];
  const begin = library.connection.beginTransaction.bind(library.connection);
  const run = library.connection.run.bind(library.connection);
  vi.spyOn(library.connection, 'beginTransaction').mockImplementation(async () => {
    transactions.push([]);
    return begin();
  });
  vi.spyOn(library.connection, 'run').mockImplementation(async (...args) => {
    transactions.at(-1)?.push(args[0]);
    return run(...args);
  });
  await act(async () => { await ui.result.current.surface.handleReadReviewTopic(); await engine.drain(); });
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).not.toBe(source));
  expect(companionWorkspaceSnapshots.getSnapshot()?.nodesById[source]?.reading?.repetitionCount).toBe(1);
  expect(ui.result.current.workspace.refreshAfterMutation).not.toHaveBeenCalled();
  expect(transactions.filter(statements => statements.some(sql => /\bdaily_flow_(state|operations)\b/u.test(sql)))).toHaveLength(1);
});
