import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false, convertFileSrc: (url: string) => url }, registerPlugin: () => ({
    ...createCompanionNativeSyncStub(), resolveAttachmentResource: native.resolve
  }) };
});

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { editableNode } from '../shared/platform/companion/editing/companionContentEditingStable.testSupport';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { CompanionArticleDocument } from './CompanionArticleDocument';
import { drawImageClozeMask, installImageClozePointerEvents } from './companionImageCloze.testSupport';
import { CompanionImageClozeLayer } from './CompanionImageClozeLayer';
import { CompanionReadingActivity } from './companionReadingActivity';
import { installReadingRangeGeometry } from './companionReadingPages.testSupport';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

const hash = 'b'.repeat(64);
const content = `Before\n\n![Diagram](asset://${hash}.png)\n\nAfter`;
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=';
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
let restoreGeometry: () => void;
beforeEach(async () => {
  restoreGeometry = installReadingRangeGeometry();
  vi.stubGlobal('PointerEvent', installImageClozePointerEvents());
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(400);
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, x: 0, y: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON() {} });
  library = await createSearchLibrary(0);
  native.resolve.mockResolvedValue({ status: 'ready', resource_url: png });
  const version = await toWorkspaceNativeNodeVersion(editableNode({ content }), 'source', 'parent-version');
  await getIosCompanionDatabaseOwner().runWriter(db => applySyncNodesWithDbPort(db, [version], { enqueueSearchInvalidations: false }));
});
afterEach(async () => { await library.close(); restoreGeometry(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('uses the actual reading image tap, creates in SQLite, refreshes parent masks, and restores masked prompt and original answer', async () => {
  const refresh = vi.fn().mockRejectedValueOnce(new Error('refresh unavailable')).mockResolvedValue(undefined);
  const workspace = { state: await loadCompanionWorkspaceSyncState(), refreshAfterMutation: refresh } as unknown as ReturnType<typeof useCompanionWorkspaceSync>;
  const activity = new CompanionReadingActivity('topic', () => {});
  const renderArticle = (nodeId = 'topic', body = content, answer?: string | null) => <MouseGestureSettingsProvider><CompanionImageClozeLayer
    activity={activity} nodeId={nodeId} content={body} versionId="parent-version" workspaceSync={workspace}>
    <CompanionArticleDocument content={body} nodeId={nodeId} />
    {answer ? <CompanionArticleDocument content={answer} nodeId={nodeId + '::answer'} /> : null}
  </CompanionImageClozeLayer></MouseGestureSettingsProvider>;
  const view = renderWithLocalization(renderArticle());
  const readingImage = await waitFor(() => {
    const image = view.container.querySelector<HTMLImageElement>('.cm-md-image-element');
    expect(image?.src).toBe(png); return image!;
  });
  fireEvent.load(readingImage);
  fireEvent.click(readingImage);
  expect(await screen.findByRole('dialog')).toBeVisible();
  fireEvent.load(screen.getByAltText('Original image'));
  drawImageClozeMask();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await screen.findByRole('alert');
  expect(library.database.prepare("SELECT count(*) FROM nodes WHERE kind='item'").pluck().get()).toBe(1);
  expect(screen.getByLabelText('Mask 1')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const ids = library.database.prepare("SELECT id FROM nodes WHERE kind='item'").all() as { id: string }[];
  expect(ids).toHaveLength(1);
  const saved = await loadCompanionWorkspaceNode(ids[0]!.id);
  workspace.state = await loadCompanionWorkspaceSyncState();
  view.rerender(renderArticle());
  await waitFor(() => expect(view.container.querySelector('[data-region-state="outlined"]')).toBeTruthy());
  // Continue from the refreshed reading surface, without rebuilding the layer.
  fireEvent.click(view.container.querySelector('.cm-md-image-element')!);
  const editor = await screen.findByRole('dialog');
  expect(editor.querySelectorAll('[data-region-state="outlined"]')).toHaveLength(1);
  fireEvent.load(screen.getByAltText('Original image'));
  drawImageClozeMask();
  expect(editor.querySelectorAll('[data-region-state="outlined"]')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(library.database.prepare("SELECT count(*) FROM nodes WHERE kind='item'").pluck().get()).toBe(2);
  workspace.state = await loadCompanionWorkspaceSyncState();
  view.rerender(renderArticle());
  fireEvent.click(view.container.querySelector('.cm-md-image-element')!);
  expect((await screen.findByRole('dialog')).querySelectorAll('[data-region-state="outlined"]')).toHaveLength(2);
  await deleteSecondMask(view, workspace, renderArticle, refresh, ids[0]!.id);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await reopenSearchLibrary(library.root, '2026-11-05T12:00:00Z');
  expect(await loadCompanionWorkspaceNode(ids[0]!.id)).toEqual({ ...saved, updatedAt: expect.any(String) });
  workspace.state = await loadCompanionWorkspaceSyncState();
  view.rerender(renderArticle(ids[0]!.id, saved!.content, saved!.reveal));
  await waitFor(() => expect(view.container.querySelector('[data-region-state="hidden"]')).toBeTruthy());
  expect(view.container.querySelector('[data-region-state="outlined"]')).toBeTruthy();
  await act(async () => { fireEvent.click(view.container.querySelector('.cm-md-image-element')!); });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

async function deleteSecondMask(view: ReturnType<typeof renderWithLocalization>, workspace: ReturnType<typeof useCompanionWorkspaceSync>,
  renderArticle: () => React.ReactElement, refresh: ReturnType<typeof vi.fn>, firstId: string) {
  const latest = library.database.prepare("SELECT id FROM nodes WHERE kind='item' AND id != ?").get(firstId) as { id: string };
  const latestNode = await loadCompanionWorkspaceNode(latest.id);
  const latestRegion = latestNode!.imageRegions![0]!.regions[0]!.id;
  fireEvent.click(screen.getByRole('dialog').querySelector(`[data-saved-region="${latestRegion}"]`)!);
  expect(screen.getByRole('dialog').querySelector(`[data-saved-region="${latestRegion}"]`)).toHaveAttribute('data-region-state', 'selected');
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected mask' }));
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(4));
  workspace.state = await loadCompanionWorkspaceSyncState();
  view.rerender(renderArticle());
  await waitFor(() => expect(screen.getByRole('dialog').querySelectorAll('[data-saved-region]')).toHaveLength(1));
  expect((await loadCompanionWorkspaceNode(latest.id))?.deletedAt).toBeTruthy();
  expect((await loadCompanionWorkspaceNode(firstId))?.deletedAt).toBeFalsy();
}
