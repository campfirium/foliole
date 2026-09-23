import { render } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { VirtualListPosition } from '../../shared/ui/virtualListPosition';

import { FolderListPositionProvider, FolderListPositionScope, useFolderListPosition } from './FolderListPosition';

const { library } = vi.hoisted(() => ({ library: { path: '/library-a/foliole.db' as string | null } }));
vi.mock('../../shared/platform/libraryPathSettingsCache', () => ({
  readRuntimeLibraryPathSettingsCache: () => library.path ? { databasePath: library.path } : null
}));

let position: VirtualListPosition | undefined;
const anchor = { index: 4, key: 'topic-4', offset: 12, order: ['topic-0', 'topic-4'] };

function List({ query }: { query: string }) {
  position = useFolderListPosition(query);
  return null;
}

function Harness({ folder = 'a', query = '', open = true }) {
  return <FolderListPositionProvider>{open ?
    <FolderListPositionScope folderId={folder}><List query={query} /></FolderListPositionScope> : null
  }</FolderListPositionProvider>;
}

beforeEach(() => { library.path = '/library-a/foliole.db'; position = undefined; });

it('retains the visible anchor across opening a document and returning', () => {
  const { rerender } = render(<Harness />);
  position!.write(anchor);
  rerender(<Harness open={false} />);
  rerender(<Harness />);
  expect(position!.read()).toEqual(anchor);
});

it('keeps different folders and filter results independent', () => {
  const { rerender } = render(<Harness />);
  position!.write(anchor);
  rerender(<Harness folder="b" />);
  expect(position!.read()).toBeUndefined();
  position!.write({ ...anchor, key: 'other' });
  rerender(<Harness query="filter" />);
  expect(position!.read()).toBeUndefined();
  rerender(<Harness />);
  expect(position!.read()).toEqual(anchor);
});

it('does not restore the same folder id from a different library', () => {
  const { rerender } = render(<Harness />);
  position!.write(anchor);
  library.path = '/library-b/foliole.db';
  rerender(<Harness />);
  expect(position!.read()).toBeUndefined();
});

it('does not create a position bucket for an unknown library', () => {
  library.path = null;
  render(<Harness />);
  expect(position).toBeUndefined();
});

it('keeps the position contract stable through an ordinary render', () => {
  const { rerender } = render(<Harness />);
  const first = position;
  position!.write(anchor);
  rerender(<Harness />);
  expect(position).toBe(first);
  expect(position!.read()).toEqual(anchor);
});
