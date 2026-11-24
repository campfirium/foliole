import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false, convertFileSrc: (url: string) => url },
    registerPlugin: () => createCompanionNativeSyncStub() };
});

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { getFormulaClozeLocator } from '../features/formula-cloze/model/formulaCloze';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { editableNode } from '../shared/platform/companion/editing/companionContentEditingStable.testSupport';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { CompanionArticleDocument } from './CompanionArticleDocument';
import { CompanionFormulaClozeLayer } from './CompanionFormulaClozeLayer';
import { installImageClozePointerEvents } from './companionImageCloze.testSupport';
import { CompanionReadingActivity } from './companionReadingActivity';
import { installReadingRangeGeometry } from './companionReadingPages.testSupport';
import { useCompanionFormulaClozePresentation } from './useCompanionFormulaClozePresentation';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
let restoreGeometry: () => void;
beforeEach(async () => {
  restoreGeometry = installReadingRangeGeometry();
  vi.stubGlobal('PointerEvent', installImageClozePointerEvents());
  HTMLElement.prototype.setPointerCapture = vi.fn();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, x: 0, y: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON() {} });
  library = await createSearchLibrary(0);
});
afterEach(async () => { await library.close(); restoreGeometry(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function seedTopic(content: string) {
  const version = await toWorkspaceNativeNodeVersion(editableNode({ content }), 'source', 'parent-version');
  await getIosCompanionDatabaseOwner().runWriter(db => applySyncNodesWithDbPort(db, [version], { enqueueSearchInvalidations: false }), { kind: 'business' });
}

function drawRegion() {
  const surface = screen.getByTestId('formula-cloze-surface');
  fireEvent.pointerDown(surface, { pointerId: 7, button: 0, clientX: 40, clientY: 40 });
  fireEvent.pointerMove(surface, { pointerId: 7, clientX: 200, clientY: 200 });
  fireEvent.pointerUp(surface, { pointerId: 7, clientX: 200, clientY: 200 });
}

it.each([
  { formula: '$$\nE = mc^2\n$$', display: 'block', occurrences: 1 },
  { formula: '$E = mc^2$', display: 'inline', occurrences: 2 },
])('saves and presents $display formula clozes at the selected occurrence', async ({ formula, display, occurrences }) => {
  const content = display === 'block' ? `Energy\n\n${formula}\n\nEnd` : `Energy ${formula} and ${formula}.`;
  await seedTopic(content);
  const selector = `.cm-md-math-widget-${display}`;
  const refresh = vi.fn().mockResolvedValue(undefined);
  const workspace = { state: await loadCompanionWorkspaceSyncState(), refreshAfterMutation: refresh } as unknown as ReturnType<typeof useCompanionWorkspaceSync>;
  const activity = new CompanionReadingActivity('topic', () => {});
  const renderArticle = (nodeId = 'topic', body = content, answer?: string | null) => <MouseGestureSettingsProvider><CompanionFormulaClozeLayer
    activity={activity} nodeId={nodeId} content={body} versionId="parent-version" workspaceSync={workspace}>
    <CompanionArticleDocument content={body} nodeId={nodeId} />
    {answer ? <CompanionArticleDocument content={answer} nodeId={nodeId + '::answer'} /> : null}
  </CompanionFormulaClozeLayer></MouseGestureSettingsProvider>;
  const view = renderWithLocalization(renderArticle());
  const widget = await waitFor(() => {
    const value = view.container.querySelector<HTMLElement>(`${selector} .katex`);
    expect(value).toBeTruthy(); return value!;
  });
  fireEvent.click(widget);
  const dialog = await screen.findByRole('dialog', { name: 'Formula cloze' });
  expect(dialog.querySelector('.katex-html')).toBeTruthy();
  drawRegion();
  drawRegion();
  expect(screen.getByRole('button', { name: 'Cloze 2' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Remove selected cloze' }));
  expect(screen.queryByRole('button', { name: 'Cloze 2' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(refresh).toHaveBeenCalledWith(undefined, 'topic');
  const ids = library.database.prepare("SELECT id FROM nodes WHERE kind='item'").all() as { id: string }[];
  expect(ids).toHaveLength(1);
  const saved = await loadCompanionWorkspaceNode(ids[0]!.id);
  expect(saved).toMatchObject({ parentNodeId: 'topic', content: formula, reveal: formula });
  expect(getFormulaClozeLocator(saved?.anchorLink)?.selection.leaves.length).toBeGreaterThan(0);

  workspace.state = await loadCompanionWorkspaceSyncState();
  view.rerender(renderArticle());
  const [sourceFormula, repeatedFormula] = await waitFor(() => {
    const widgets = view.container.querySelectorAll(selector);
    expect(widgets).toHaveLength(occurrences);
    expect(widgets[0]!.querySelector('[data-md-formula-region-outlined="true"]')).toBeTruthy();
    return Array.from(widgets);
  });
  if (occurrences === 2) {
    expect(repeatedFormula!.querySelector('[data-md-formula-region-outlined="true"]')).toBeNull();
  }
  fireEvent.click(sourceFormula!.querySelector('.katex')!);
  expect((await screen.findByRole('dialog')).querySelectorAll('[data-formula-saved]')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  view.rerender(renderArticle(saved!.id, saved!.content, saved!.reveal));
  await waitFor(() => expect(view.container.querySelector('[data-md-formula-region-hidden="true"]')).toBeTruthy());
  expect(view.container.querySelector('[data-md-formula-region-outlined="true"]')).toBeTruthy();
  // An Item is not a source: tapping its formula does not open the sheet.
  await act(async () => { fireEvent.click(view.container.querySelector(`${selector} .katex`)!); });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it.each([0, 250])('does not traverse the library when changing articles with %i unrelated nodes', async (unrelatedCount) => {
  await seedTopic('One ordinary article.');
  const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
  const topic = snapshot.nodesById.topic!;
  const nodes: typeof snapshot.nodesById = { ...snapshot.nodesById, other: { ...topic, id: 'other' } };
  for (let index = 0; index < unrelatedCount; index++) {
    const id = `unrelated-${index}`;
    nodes[id] = { ...topic, id };
  }
  const enumerate = vi.fn(Reflect.ownKeys);
  const source = { ...snapshot, nodesById: new Proxy<typeof nodes>(nodes, { ownKeys: enumerate }) };
  const presentation = renderHook(({ nodeId }) => useCompanionFormulaClozePresentation(source, nodeId),
    { initialProps: { nodeId: 'topic' } });
  expect(presentation.result.current).toEqual([]);

  enumerate.mockClear();
  presentation.rerender({ nodeId: 'other' });
  expect(presentation.result.current).toEqual([]);
  presentation.rerender({ nodeId: 'topic' });
  expect(presentation.result.current).toEqual([]);
  expect(enumerate).not.toHaveBeenCalled();
});
