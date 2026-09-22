import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import * as browse from '../shared/platform/companionBrowseLists';

import { useCompanionDirectorySections } from './useCompanionDirectorySections';

type HookArgs = Parameters<typeof useCompanionDirectorySections>[0];

function node(id: string, parentNodeId: string | null = null): WorkspaceSnapshot['nodesById'][string] {
  return {
    id, parentNodeId, kind: 'topic', title: id, content: '', isTitleManual: false,
    hideTitleHeading: false, reveal: null, anchorLink: null, reading: null, review: null,
    createdAt: '2026-09-21', updatedAt: '2026-09-21'
  };
}

function createArgs(): HookArgs {
  return {
    directory: { entries: [], folders: [] },
    selection: { kind: 'internal', nodeId: 'folder' },
    sortDirection: 'desc', sortKey: 'dateSaved',
    snapshot: {
      activeNodeId: null, nodeOrder: ['folder', 'older', 'newer', 'other', 'other-child'],
      nodesById: {
        folder: { ...node('folder'), kind: 'folder' },
        older: node('older', 'folder'),
        newer: { ...node('newer', 'folder'), updatedAt: '2026-09-22' },
        other: { ...node('other'), kind: 'folder' },
        'other-child': node('other-child', 'other')
      },
      trashedNodeIds: [], untitledSequenceByParent: {}
    }
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return <LocalizationProvider initialLanguagePreference="en">{children}</LocalizationProvider>;
}

function itemIds(result: ReturnType<typeof useCompanionDirectorySections>) {
  return result.sections.flatMap((section) => section.items.map((item) => item.nodeId));
}

afterEach(() => vi.restoreAllMocks());

it('derives only the selected ordinary folder rather than hidden root and trash views', () => {
  const folder = vi.spyOn(browse, 'resolveCompanionFolderViewByNodeId');
  const root = vi.spyOn(browse, 'resolveCompanionRootDirectoryView');
  const trash = vi.spyOn(browse, 'resolveCompanionTrashView');
  const trashFolder = vi.spyOn(browse, 'resolveCompanionTrashFolderViewByNodeId');
  const args = createArgs();
  const { result } = renderHook(useCompanionDirectorySections, { initialProps: args, wrapper });
  expect(itemIds(result.current)).toEqual(['newer', 'older']);
  expect(folder).toHaveBeenCalledExactlyOnceWith(args.snapshot, 'folder', 'dateSaved', 'desc');
  expect(root).not.toHaveBeenCalled();
  expect(trash).not.toHaveBeenCalled();
  expect(trashFolder).not.toHaveBeenCalled();
});

it('reuses sections across equivalent selection and active/session snapshot changes', () => {
  const folder = vi.spyOn(browse, 'resolveCompanionFolderViewByNodeId');
  const args = createArgs();
  const { result, rerender } = renderHook(useCompanionDirectorySections, { initialProps: args, wrapper });
  const original = result.current.sections;
  rerender({ ...args, selection: { kind: 'internal', nodeId: 'folder' }, snapshot: {
    ...args.snapshot!, activeNodeId: 'older', persistedNodeViewById: {}
  } });
  expect(result.current.sections).toBe(original);
  expect(folder).toHaveBeenCalledTimes(1);
});

it('updates the current results for changed nodes and reevaluates changed order inputs', () => {
  const folder = vi.spyOn(browse, 'resolveCompanionFolderViewByNodeId');
  const args = createArgs();
  const { result, rerender } = renderHook(useCompanionDirectorySections, { initialProps: args, wrapper });
  const changed = { ...args, snapshot: { ...args.snapshot!, nodesById: {
    ...args.snapshot!.nodesById, older: { ...node('older', 'folder'), title: 'Renamed' },
    added: node('added', 'folder')
  } } };
  rerender(changed);
  expect(itemIds(result.current)).toEqual(['newer', 'added', 'older']);
  expect(result.current.sections[0]?.items.find((item) => item.nodeId === 'older')?.title).toBe('Renamed');
  expect(folder).toHaveBeenCalledTimes(2);
  const reordered = { ...changed, snapshot: { ...changed.snapshot, nodeOrder: [...changed.snapshot.nodeOrder].reverse() } };
  rerender(reordered);
  expect(folder).toHaveBeenCalledTimes(3);
  expect(folder).toHaveBeenLastCalledWith(reordered.snapshot, 'folder', 'dateSaved', 'desc');
  expect(itemIds(result.current)).toEqual(['newer', 'added', 'older']);
});

it('applies changed sort settings and derives only the newly selected folder', () => {
  const folder = vi.spyOn(browse, 'resolveCompanionFolderViewByNodeId');
  const args = createArgs();
  const { result, rerender } = renderHook(useCompanionDirectorySections, { initialProps: args, wrapper });
  rerender({ ...args, sortDirection: 'asc' });
  expect(itemIds(result.current)).toEqual(['older', 'newer']);
  rerender({ ...args, sortKey: 'name' });
  expect(folder).toHaveBeenLastCalledWith(args.snapshot, 'folder', 'name', 'desc');
  rerender({ ...args, selection: { kind: 'internal', nodeId: 'other' } });
  expect(itemIds(result.current)).toEqual(['other-child']);
  expect(folder).toHaveBeenLastCalledWith(args.snapshot, 'other', 'dateSaved', 'desc');
  expect(folder).toHaveBeenCalledTimes(4);
});

it('derives root and trash only when those selections are requested', () => {
  const root = vi.spyOn(browse, 'resolveCompanionRootDirectoryView');
  const trash = vi.spyOn(browse, 'resolveCompanionTrashView');
  const folder = vi.spyOn(browse, 'resolveCompanionFolderViewByNodeId');
  const args = createArgs();
  const { result, rerender } = renderHook(useCompanionDirectorySections, { initialProps: args, wrapper });
  rerender({ ...args, selection: { kind: 'root' } });
  expect(itemIds(result.current)).toContain('folder');
  expect(root).toHaveBeenCalledTimes(1);
  expect(trash).not.toHaveBeenCalled();
  rerender({ ...args, selection: { kind: 'trash' } });
  expect(itemIds(result.current)).toEqual([]);
  expect(trash).toHaveBeenCalledTimes(1);
  expect(root).toHaveBeenCalledTimes(1);
  expect(folder).toHaveBeenCalledTimes(1);
});
