import { expect, it } from 'vitest';

import { createInitialWorkspaceState } from '../../store/workspaceStore';

import { buildEditorPaletteOptions } from './appPaletteEditorOptions';

function options(kind: 'topic' | 'item' | 'folder', trashed = false) {
  const initial = createInitialWorkspaceState(new Date('2026-10-27T00:00:00.000Z'));
  const base = Object.values(initial.nodesById).find((node) => node.kind === 'topic')!;
  const node = { ...base, id: 'manual', kind, anchorLink: null, parentNodeId: null, content: 'Question body.', reveal: null,
    bodyStatus: 'ready' as const, hasContent: true, hasReveal: false };
  return buildEditorPaletteOptions({ activeNodeId: node.id, isViewingTrashNode: trashed,
    ws: { nodesById: { [node.id]: node }, trashedNodeIds: trashed ? [node.id] : [] } });
}

it.each(['topic', 'item'] as const)('offers current export for an unanchored root %s', (kind) => {
  expect(options(kind).canExportCurrentArticle).toBe(true);
});

it('does not offer current export for folders or trashed Items', () => {
  expect(options('folder').canExportCurrentArticle).toBe(false);
  expect(options('item', true).canExportCurrentArticle).toBe(false);
});

it('disables annotation commands in Items while retaining editing and export capabilities', () => {
  expect(options('item')).toMatchObject({ canAnnotateSelection: false, canExportCurrentArticle: true,
    canRepairTable: true, canCleanFormatting: true });
  expect(options('topic').canAnnotateSelection).toBe(true);
});
