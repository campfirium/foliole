// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useMemo, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { score } from '../../electron/database/reviewProjection.testSupport';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { loadCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { CompanionFlowHistorySurface, CompanionFlowOrEditHistoryActions } from './CompanionFlowHistorySurface';
import { CompanionReadingActivity } from './companionReadingActivity';
import { createFloatingBar, createWorkspaceSync } from './useCompanionArticleSurfaceTestSupport';
import { useCompanionFlowSession } from './useCompanionFlowSession';
import { useCompanionSurfaceActions } from './useCompanionSurfaceActions';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => true },
    registerPlugin: () => ({ ...createCompanionNativeSyncStub(), setFlowGestureRegion: async () => {} }) };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
let initial: WorkspaceSnapshot;
let failRefresh = 0;
let historyKey = '';
const stored = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
let before: unknown;
let baselineFacts: unknown[];
const facts = () => library.database.prepare('SELECT * FROM review_log ORDER BY op_id').all();
beforeEach(async () => {
  failRefresh = 0;
  library = await createSearchLibrary(0);
  const insert = library.database.prepare("INSERT INTO nodes (id,title,kind,content,reveal,created_at,updated_at) VALUES (?,?,'item',?,'Answer','2026-01-01','2026-01-01')");
  for (const id of ['a', 'b']) {
    insert.run(id, id, id);
    score({ sqlite: library.database, id: 'fixture' }, `${id}-first`, '2026-09-01T00:00:00.000Z', 3, id);
    score({ sqlite: library.database, id: 'fixture' }, `${id}-second`, '2026-09-08T00:00:00.000Z', 3, id);
  }
  initial = await stored();
  before = initial.nodesById.a?.review;
  baselineFacts = facts();
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: () => {} });
});
afterEach(async () => { cleanup(); await library.close(); });

function Reader() {
  const [value, setValue] = useState(initial);
  const flow = useCompanionFlowSession({ snapshot: value, ready: true, active: true, libraryScope: 'ui-test' });
  useEffect(() => { flow.setMode('review-first'); }, []);
  const nodeId = flow.view.currentCard?.nodeId ?? '';
  const activity = useMemo(() => new CompanionReadingActivity(nodeId, () => {}), [nodeId]);
  const workspace = createWorkspaceSync(value);
  workspace.refreshAfterMutation.mockImplementation(async () => {
    if (failRefresh > 0) { failRefresh -= 1; throw new Error('refresh failed'); }
    const next = await stored(); setValue(next); return next;
  });
  const actions = useCompanionSurfaceActions({ flow, snapshot: value, active: true, activity,
    floatingBar: createFloatingBar(), workspaceSync: workspace });
  historyKey = flow.historyKey;
  return <CompanionFlowHistorySurface active={flow.ready} busy={actions.isSubmittingGrade}
    historyKey={historyKey} refreshPending={actions.historyRefreshPending} onApply={mode => void actions.handleFlowHistory(mode)}>
    <output data-testid="current-card">{nodeId || 'done'}</output>
    <button onClick={flow.reveal}>Reveal answer</button>
    <button onClick={() => void actions.handleGradeReview(3)}>Grade good</button>
    <section aria-label="History menu"><CompanionFlowOrEditHistoryActions open /></section>
    {actions.reviewError ? <p role="alert">{actions.reviewError}</p> : null}
  </CompanionFlowHistorySurface>;
}
const openReader = () => render(<LocalizationProvider initialLanguagePreference="en"><Reader /></LocalizationProvider>);
async function grade() {
  fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Grade good' }));
  await waitFor(() => expect(screen.getByTestId('current-card')).toHaveTextContent('b'));
  await waitFor(() => expect(screen.getByTestId('flow-edge-undo')).not.toBeDisabled());
}
function swipe(mode: 'undo' | 'redo') {
  const element = screen.getByTestId(`flow-edge-${mode}`);
  for (const [type, clientX] of [['pointerdown', mode === 'undo' ? 2 : 390], ['pointerup', mode === 'undo' ? 82 : 310]] as const) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { clientX, clientY: 400, pointerId: 1, pointerType: 'touch', isPrimary: true });
    fireEvent(element, event);
  }
}

it('connects both edge directions to the real grading, history and SQLite paths', async () => {
  openReader();
  await waitFor(() => expect(screen.getByTestId('current-card')).toHaveTextContent('a'));
  await grade();
  swipe('undo');
  await waitFor(() => expect(screen.getByTestId('current-card')).toHaveTextContent('a'));
  expect((await stored()).nodesById.a?.review).toEqual(before);
  await waitFor(() => expect(screen.getByTestId('flow-edge-redo')).not.toBeDisabled());
  swipe('redo');
  await waitFor(() => expect(screen.getByTestId('current-card')).toHaveTextContent('b'));
  expect((await stored()).nodesById.a?.review?.reps).toBe(3);
  expect(facts()).toEqual(expect.arrayContaining(baselineFacts));
  expect(facts()).toHaveLength(7);
  expect(library.database.prepare("SELECT * FROM review_log WHERE kind = 'void'").all()).toHaveLength(1);
});

it('retries only refresh after a committed undo, without undoing another action', async () => {
  openReader();
  await waitFor(() => expect(screen.getByTestId('current-card')).toHaveTextContent('a'));
  await grade();
  failRefresh = 1;
  swipe('undo');
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not undo or redo'));
  const history = await loadCompanionFlowHistory(historyKey);
  expect(history.undoStack).toHaveLength(0);
  expect(history.redoStack).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect((await loadCompanionFlowHistory(historyKey)).redoStack).toHaveLength(1);
  expect((await stored()).nodesById.a?.review).toEqual(before);
});

it('hydrates the restored Flow position and redo availability after remount', async () => {
  const ui = openReader();
  await waitFor(() => expect(screen.getByTestId('current-card')).toHaveTextContent('a'));
  await grade();
  swipe('undo');
  await waitFor(() => expect(screen.getByTestId('flow-edge-redo')).not.toBeDisabled());
  ui.unmount();
  initial = await stored();
  await act(async () => { openReader(); });
  await waitFor(() => expect(screen.getByTestId('current-card')).toHaveTextContent('a'));
  await waitFor(() => expect(screen.getByTestId('flow-edge-redo')).not.toBeDisabled());
  swipe('redo');
  await waitFor(() => expect(screen.getByTestId('current-card')).toHaveTextContent('b'));
});
