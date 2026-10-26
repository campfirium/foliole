// @vitest-environment jsdom
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { writeCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createEmptyReviewSession } from '../store/workspaceReviewReading';

import { CompanionFlowHistorySurface } from './CompanionFlowHistorySurface';
import { useCompanionWorkspaceHistoryAvailability } from './useCompanionWorkspaceHistory';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => true },
    registerPlugin: () => ({ ...createCompanionNativeSyncStub(), setFlowGestureRegion: async () => {} }) };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
const key = 'flow_history:large-availability';
beforeEach(async () => {
  library = await createSearchLibrary(0);
  const session = { ...createEmptyReviewSession(), currentNodeId: 'a', totalNodeCount: 14000,
    queueNodeIds: Array.from({ length: 14000 }, (_, i) => `history-node-${i}`) };
  const context = { activeNodeId: 'a', browseRootNodeId: '', reviewSession: session };
  const entry = { type: 'topic.dismiss' as const, title: 'Soon Topic' as const, id: 'history-entry',
    nodeId: 'a', mutationTimestamp: '2026-10-26T00:00:00.000Z', beforeReading: null,
    afterReading: null, beforeContext: context, afterContext: context };
  await writeIosCompanionDatabase(db => writeCompanionFlowHistory(db, key, {
    undoStack: Array.from({ length: 10 }, (_, i) => ({ ...entry, id: `entry-${i}` })), redoStack: []
  }));
});
afterEach(async () => { cleanup(); vi.restoreAllMocks(); await library.close(); });

function observeReadBytes() {
  let bytes = 0;
  const owner = getIosCompanionDatabaseOwner();
  const original = owner.read.bind(owner);
  const observe = (db: DbPort): DbPort => ({ ...db,
    query: async <R extends DbRow>(sql: string, params?: DbParams) => {
      const rows = await db.query<R>(sql, params);
      bytes += JSON.stringify(rows).length;
      return rows;
    }, transaction: task => db.transaction(tx => task(observe(tx))) });
  vi.spyOn(owner, 'read').mockImplementation(<T,>(task: (db: DbPort) => Promise<T>) => original(db => task(observe(db))));
  return () => bytes;
}

it('checks workspace undo availability without transferring stored sessions', async () => {
  const bytes = observeReadBytes();
  const ui = renderHook(() => useCompanionWorkspaceHistoryAvailability(key));
  await waitFor(() => expect(ui.result.current).toEqual({ canUndo: true, canRedo: false }));
  expect(bytes()).toBeLessThan(256);
});

it('checks Flow edge availability without transferring stored sessions', async () => {
  const bytes = observeReadBytes();
  render(<LocalizationProvider initialLanguagePreference="en">
    <CompanionFlowHistorySurface active busy={false} historyKey={key} onApply={() => {}}>
      <p>Reading</p>
    </CompanionFlowHistorySurface>
  </LocalizationProvider>);
  await waitFor(() => expect(screen.getByTestId('flow-edge-undo')).not.toBeDisabled());
  expect(screen.getByTestId('flow-edge-redo')).toBeDisabled();
  expect(bytes()).toBeLessThan(256);
});
