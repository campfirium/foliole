import { act, createEvent, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { moveFolders, renderFolderDrag } from './NodeListFolderDrag.test-support';

const advance = (milliseconds: number) => act(() => vi.advanceTimersByTime(milliseconds));
const expectCollapsed = (name = 'Target child') => expect(screen.queryByRole('treeitem', { name })).toBeNull();

beforeEach(() => { vi.useFakeTimers(); moveFolders.mockClear(); });
afterEach(() => { vi.useRealTimers(); });

it('expands a folder only after a continuous 500ms child hover', () => {
  const drag = renderFolderDrag();
  drag.hover();
  expectCollapsed();
  advance(499);
  expectCollapsed();
  advance(1);
  expect(screen.getByRole('treeitem', { name: 'Target child' })).toBeVisible();
});

it.each([0, 100])('does not expand while sorting at %s percent of the row', clientY => {
  const drag = renderFolderDrag();
  drag.hover('Target', clientY);
  advance(1000);
  expectCollapsed();
});

it('does not restart the wait for repeated events or moves inside a row', () => {
  const drag = renderFolderDrag();
  drag.hover();
  advance(250);
  const target = drag.row('Target');
  const leave = createEvent.dragLeave(target, { dataTransfer: drag.transfer });
  Object.defineProperty(leave, 'relatedTarget', { value: target.firstElementChild });
  fireEvent(target, leave);
  drag.hover();
  advance(250);
  expect(screen.getByRole('treeitem', { name: 'Target child' })).toBeVisible();
});

it.each(['leave', 'edge', 'invalid', 'end', 'drop-root'])('cancels the wait on %s', action => {
  const drag = renderFolderDrag();
  drag.hover();
  advance(300);
  if (action === 'leave') fireEvent.dragLeave(drag.row('Target'), { relatedTarget: document.body });
  if (action === 'edge') drag.hover('Target', 0);
  if (action === 'invalid') drag.hover('Descendant');
  if (action === 'end') fireEvent.dragEnd(drag.source);
  if (action === 'drop-root') fireEvent.drop(screen.getByRole('tree', { name: 'Directory tree' }), { dataTransfer: drag.transfer });
  advance(1000);
  expectCollapsed();
});

it('starts a new wait when the target changes', () => {
  const drag = renderFolderDrag();
  drag.hover();
  advance(300);
  drag.hover('Other');
  advance(499);
  expectCollapsed();
  expectCollapsed('Other child');
  advance(1);
  expect(screen.getByRole('treeitem', { name: 'Other child' })).toBeVisible();
});

it('moves a folder immediately on early drop and cancels remaining expansion', () => {
  const drag = renderFolderDrag();
  drag.hover();
  advance(200);
  fireEvent.drop(drag.row('Target'), { clientY: 50, dataTransfer: drag.transfer });
  expect(moveFolders).toHaveBeenCalledWith(['Source'], 'Target', 'child');
  advance(1000);
  expectCollapsed();
});

it('does not expand on hover without an active drag source', () => {
  const drag = renderFolderDrag();
  fireEvent.dragEnd(drag.source);
  fireEvent.dragOver(drag.row('Target'), { clientY: 50, dataTransfer: { getData: () => '' } });
  advance(1000);
  expectCollapsed();
});

it('cancels a pending wait when the tree unmounts', () => {
  const drag = renderFolderDrag();
  drag.hover();
  advance(200);
  drag.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps cross-tree edge drops as child and cancels on the source tree ending', () => {
  const drag = renderFolderDrag(true);
  drag.hover('Target', 0);
  expect(drag.row('Target')).toHaveAttribute('data-drop-intent', 'child');
  expect(screen.getByRole('tooltip', { name: 'Move into “Target”' })).toBeInTheDocument();
  advance(300);
  fireEvent.dragEnd(drag.source);
  advance(1000);
  expectCollapsed();
});

it('expands a cross-tree child target after waiting at its geometric edge', () => {
  const drag = renderFolderDrag(true);
  drag.hover('Target', 0);
  advance(499);
  expectCollapsed();
  advance(1);
  expect(screen.getByRole('treeitem', { name: 'Target child' })).toBeVisible();
});

it('shows the destination only for an eligible move into a folder', () => {
  const drag = renderFolderDrag();
  const destination = () => screen.queryByRole('tooltip', { name: 'Move into “Target”' });
  expect(destination()).not.toBeInTheDocument();
  drag.hover('Target', 0);
  expect(drag.row('Target')).toHaveAttribute('data-drop-intent', 'before');
  expect(destination()).not.toBeInTheDocument();
  drag.hover();
  expect(destination()).toBeInTheDocument();
  drag.hover('Target', 100);
  expect(drag.row('Target')).toHaveAttribute('data-drop-intent', 'after');
  expect(destination()).not.toBeInTheDocument();
  drag.hover();
  drag.hover('Descendant');
  expect(destination()).not.toBeInTheDocument();
  drag.hover();
  fireEvent.dragEnd(drag.source);
  expect(destination()).not.toBeInTheDocument();
});
