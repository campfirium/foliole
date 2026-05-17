import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';

import { useStableWorkspaceContentItems } from './workspaceStableContentSort';

interface StableSortItem {
  id: string;
  modifiedAt: string;
  title: string;
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
      <ol>
        {sortedItems.map((item) => (
          <li key={item.id}>{`${item.title}:${item.modifiedAt}`}</li>
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
