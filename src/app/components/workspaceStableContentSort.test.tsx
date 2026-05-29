import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import { useStableWorkspaceContentItems } from './workspaceStableContentSort';

interface StableSortItem {
  id: string;
  lastOpenedAt?: string;
  modifiedAt: string;
  title: string;
}

const stableCacheItems: StableSortItem[] = [
  { id: 'old', modifiedAt: '2026-04-20T00:00:00.000Z', title: 'Old' },
  { id: 'new', modifiedAt: '2026-04-21T00:00:00.000Z', title: 'New' }
];

const stableCacheSort = { direction: 'desc', key: 'modifiedAt' } as const;

function getStableSortItemId(item: StableSortItem) {
  return item.id;
}

function StableCacheHitHarness(props: { sortItems: (items: StableSortItem[]) => StableSortItem[] }) {
  const [count, setCount] = useState(0);
  const sortedItems = useStableWorkspaceContentItems({
    getItemId: getStableSortItemId,
    items: stableCacheItems,
    scopeKey: 'folder-a',
    sort: stableCacheSort,
    sortItems: props.sortItems
  });

  return (
    <>
      <button onClick={() => setCount((current) => current + 1)} type="button">
        Rerender
      </button>
      <p>{count}</p>
      <ol>
        {sortedItems.map((item) => (
          <li key={item.id}>{item.title}</li>
        ))}
      </ol>
    </>
  );
}

function StableSortHarness() {
  const [items, setItems] = useState<StableSortItem[]>([
    { id: 'old', modifiedAt: '2026-04-20T00:00:00.000Z', title: 'Old' },
    { id: 'new', modifiedAt: '2026-04-21T00:00:00.000Z', title: 'New' }
  ]);
  const sortedItems = useStableWorkspaceContentItems({
    getItemId: (item) => item.id,
    items,
    scopeKey: 'folder-a',
    sort: { direction: 'desc', key: 'modifiedAt' },
    sortItems: (currentItems) => [...currentItems].sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt))
  });

  return (
    <>
      <button
        onClick={() =>
          setItems((currentItems) =>
            currentItems.map((item) =>
              item.id === 'old' ? { ...item, modifiedAt: '2026-04-22T00:00:00.000Z' } : item
            )
          )
        }
        type="button"
      >
        Touch old
      </button>
      <ol>
        {sortedItems.map((item) => (
          <li key={item.id}>{`${item.title}:${item.modifiedAt}`}</li>
        ))}
      </ol>
    </>
  );
}

function StableSortScopeHarness() {
  const [scopeKey, setScopeKey] = useState('folder-a');
  const [items, setItems] = useState<StableSortItem[]>([
    { id: 'old', modifiedAt: '2026-04-20T00:00:00.000Z', title: 'Old' },
    { id: 'new', modifiedAt: '2026-04-21T00:00:00.000Z', title: 'New' }
  ]);
  const sortedItems = useStableWorkspaceContentItems({
    getItemId: (item) => item.id,
    items,
    scopeKey,
    sort: { direction: 'desc', key: 'modifiedAt' },
    sortItems: (currentItems) => [...currentItems].sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt))
  });

  return (
    <>
      <button
        onClick={() =>
          setItems((currentItems) =>
            currentItems.map((item) =>
              item.id === 'old' ? { ...item, modifiedAt: '2026-04-22T00:00:00.000Z' } : item
            )
          )
        }
        type="button"
      >
        Touch old
      </button>
      <button onClick={() => setScopeKey('folder-b')} type="button">
        Switch folder
      </button>
      <button onClick={() => setScopeKey('folder-a')} type="button">
        Switch back
      </button>
      <ol>
        {sortedItems.map((item) => (
          <li key={item.id}>{`${item.title}:${item.modifiedAt}`}</li>
        ))}
      </ol>
    </>
  );
}

function LastOpenedStableSortHarness() {
  const [items, setItems] = useState<StableSortItem[]>([
    { id: 'old', lastOpenedAt: '2026-04-20T00:00:00.000Z', modifiedAt: '2026-04-20T00:00:00.000Z', title: 'Old' },
    { id: 'new', lastOpenedAt: '2026-04-21T00:00:00.000Z', modifiedAt: '2026-04-21T00:00:00.000Z', title: 'New' }
  ]);
  const sortedItems = useStableWorkspaceContentItems({
    getItemId: (item) => item.id,
    items,
    scopeKey: 'folder-a',
    sort: { direction: 'desc', key: 'lastOpenedAt' },
    sortItems: (currentItems) =>
      [...currentItems].sort((left, right) => (right.lastOpenedAt ?? '').localeCompare(left.lastOpenedAt ?? ''))
  });

  return (
    <>
      <button
        onClick={() =>
          setItems((currentItems) =>
            currentItems.map((item) =>
              item.id === 'old' ? { ...item, lastOpenedAt: '2026-04-22T00:00:00.000Z' } : item
            )
          )
        }
        type="button"
      >
        Open old
      </button>
      <ol>
        {sortedItems.map((item) => (
          <li key={item.id}>{`${item.title}:${item.lastOpenedAt}`}</li>
        ))}
      </ol>
    </>
  );
}

it('keeps dynamic workspace content order stable while item timestamps update', () => {
  render(<StableSortHarness />);

  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'New:2026-04-21T00:00:00.000Z',
    'Old:2026-04-20T00:00:00.000Z'
  ]);

  fireEvent.click(screen.getByRole('button', { name: 'Touch old' }));

  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'New:2026-04-21T00:00:00.000Z',
    'Old:2026-04-22T00:00:00.000Z'
  ]);
});

it('reuses sorted content when only the parent rerenders', () => {
  const sortItems = vi.fn((items: StableSortItem[]) =>
    [...items].sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt))
  );

  render(<StableCacheHitHarness sortItems={sortItems} />);
  expect(sortItems).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'Rerender' }));

  expect(sortItems).toHaveBeenCalledTimes(1);
  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['New', 'Old']);
});

it('rebuilds dynamic workspace content order after changing folder scope', () => {
  render(<StableSortScopeHarness />);

  fireEvent.click(screen.getByRole('button', { name: 'Touch old' }));

  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'New:2026-04-21T00:00:00.000Z',
    'Old:2026-04-22T00:00:00.000Z'
  ]);

  fireEvent.click(screen.getByRole('button', { name: 'Switch folder' }));

  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'Old:2026-04-22T00:00:00.000Z',
    'New:2026-04-21T00:00:00.000Z'
  ]);
});

it('rebuilds dynamic order when switching back to a folder scope', () => {
  render(<StableSortScopeHarness />);

  fireEvent.click(screen.getByRole('button', { name: 'Touch old' }));
  fireEvent.click(screen.getByRole('button', { name: 'Switch folder' }));
  fireEvent.click(screen.getByRole('button', { name: 'Switch back' }));

  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'Old:2026-04-22T00:00:00.000Z',
    'New:2026-04-21T00:00:00.000Z'
  ]);
});

it('keeps current last opened list order stable while opened times update', () => {
  render(<LastOpenedStableSortHarness />);

  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'New:2026-04-21T00:00:00.000Z',
    'Old:2026-04-20T00:00:00.000Z'
  ]);

  fireEvent.click(screen.getByRole('button', { name: 'Open old' }));

  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'New:2026-04-21T00:00:00.000Z',
    'Old:2026-04-22T00:00:00.000Z'
  ]);
});
