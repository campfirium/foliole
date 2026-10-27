import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { UNTITLED_NODE_TITLE } from '../../features/nodes/model/deriveNodeTitle';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { resolveFolderListLocationPath } from './folderListLocationPath';
import { FolderListView } from './FolderListView';
import { FolderListViewItem } from './FolderListViewItem';

function node(id: string, parentNodeId: string | null = null, title = id): Node {
  return {
    id, parentNodeId, title, kind: 'topic', content: '', reveal: null, review: null,
    createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z'
  };
}

function observeNodes(nodes: Node[]) {
  const reads: string[] = [];
  const enumerate = vi.fn();
  const nodesById = new Proxy(Object.fromEntries(nodes.map((entry) => [entry.id, entry])), {
    get(target, key: string) {
      reads.push(key);
      return target[key];
    },
    ownKeys(target) {
      enumerate();
      return Reflect.ownKeys(target);
    }
  });
  return { nodesById, reads, enumerate };
}

describe('folder list location work', () => {
  it('renders and selects an ordinary row without reading the location graph', () => {
    const entry = node('entry', 'parent');
    const graph = observeNodes([node('parent'), entry]);
    const onSelectNode = vi.fn();
    renderWithLocalization(
      <FolderListViewItem itemLayout="default" node={entry} nodesById={graph.nodesById}
        onSelectNode={onSelectNode} sortKey="name" />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open entry' }));
    expect(onSelectNode).toHaveBeenCalledWith('entry', expect.objectContaining({ shiftKey: false }));
    expect(screen.queryByRole('button', { name: /Open real location/ })).not.toBeInTheDocument();
    expect(graph.enumerate).not.toHaveBeenCalled();
    expect(graph.reads).toEqual([]);
  });

  it.each([100, 1000, 10000])('reads only ancestors for ten rendered results among %i nodes', (count) => {
    const entries = Array.from({ length: 10 }, (_, index) => node(`entry-${index}`, 'parent'));
    const graph = observeNodes([
      node('root'), node('parent', 'root'), ...entries,
      ...Array.from({ length: count - 12 }, (_, index) => node(`unrelated-${index}`))
    ]);
    renderWithLocalization(<ul>{entries.map((entry) => (
      <FolderListViewItem key={entry.id} itemLayout="virtual-result" node={entry}
        nodesById={graph.nodesById} onSelectNode={vi.fn()} sortKey="name" />
    ))}</ul>);
    const locations = screen.getAllByRole('button', { name: /Open real location/ });
    expect(locations).toHaveLength(10);
    locations.forEach((location) => expect(location).toHaveTextContent('root / parent'));
    expect(graph.enumerate).not.toHaveBeenCalled();
    expect(graph.reads.length).toBeLessThanOrEqual(entries.length * 2);
    expect(new Set(graph.reads)).toEqual(new Set(['parent', 'root']));
  });
});

describe('folder list location semantics', () => {
  it('keeps the full path and projected image highlight title', () => {
    const image = {
      ...node('image', 'four', UNTITLED_NODE_TITLE),
      anchorLink: { id: 'cover-highlight', kind: 'highlight' as const },
      content: '![Cover](asset://cover.png)'
    };
    const graph = observeNodes([
      node('one'), node('two', 'one'), node('three', 'two'), node('four', 'three'), image
    ]);
    expect(resolveFolderListLocationPath(node('entry', 'image'), graph.nodesById))
      .toBe('one / two / three / four / Cover');
  });

  it('handles top level, missing ancestors and cycles with the existing path semantics', () => {
    const graph = observeNodes([node('a', 'b'), node('b', 'a'), node('partial', 'missing')]);
    expect(resolveFolderListLocationPath(node('top'), graph.nodesById)).toBe('Top level');
    expect(resolveFolderListLocationPath(node('orphan', 'missing'), graph.nodesById)).toBe('Top level');
    expect(resolveFolderListLocationPath(node('entry', 'partial'), graph.nodesById)).toBe('partial');
    expect(resolveFolderListLocationPath(node('entry', 'a'), graph.nodesById)).toBe('b / a');
  });

  it('updates paths after ancestor rename and move while retaining location selection actions', () => {
    const entry = node('entry', 'parent');
    const onSelectNode = vi.fn();
    const onSelectNodePath = vi.fn();
    const renderItem = (ancestors: Node[]) => (
      <FolderListViewItem itemLayout="virtual-result" node={entry}
        nodesById={Object.fromEntries([...ancestors, entry].map((value) => [value.id, value]))}
        onSelectNode={onSelectNode} onSelectNodePath={onSelectNodePath} sortKey="name" />
    );
    const view = renderWithLocalization(renderItem([node('root'), node('parent', 'root')]));
    expect(screen.getByRole('button', { name: 'Open real location for entry' })).toHaveTextContent('root / parent');
    view.rerender(renderItem([node('other'), node('parent', 'other', 'Renamed')]));
    const location = screen.getByRole('button', { name: 'Open real location for entry' });
    expect(location).toHaveTextContent('other / Renamed');
    fireEvent.click(location);
    expect(onSelectNodePath).toHaveBeenCalledWith('entry');
    fireEvent.click(location, { shiftKey: true });
    expect(onSelectNode).toHaveBeenCalledWith('entry', expect.objectContaining({ shiftKey: true }));
  });
});

it('keeps virtual result paths and navigation attached to the same entries after sorting and searching', () => {
  const entries = [node('alpha', 'first', 'Alpha'), node('beta', 'second', 'Beta')];
  const nodesById = Object.fromEntries([
    node('root'), node('first', 'root'), node('second', 'root'), ...entries
  ].map((entry) => [entry.id, entry]));
  const onSelectNodePath = vi.fn();
  const list = (sortDirection: 'asc' | 'desc') => (
    <FolderListView itemLayout="virtual-result" nodes={entries} nodesById={nodesById}
      onSelectNode={vi.fn()} onSelectNodePath={onSelectNodePath}
      sortKey="name" sortDirection={sortDirection} />
  );
  const view = renderWithLocalization(list('asc'));
  const titles = () => screen.getAllByRole('button', { name: /^Open (Alpha|Beta)$/ })
    .map((button) => button.textContent);
  expect(titles()).toEqual(['Alpha', 'Beta']);
  view.rerender(list('desc'));
  expect(titles()).toEqual(['Beta', 'Alpha']);
  expect(screen.getByRole('button', { name: 'Open real location for Alpha' })).toHaveTextContent('root / first');
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search folder contents' }), {
    target: { value: 'Beta' }
  });
  expect(titles()).toEqual(['Beta']);
  const location = screen.getByRole('button', { name: 'Open real location for Beta' });
  expect(location).toHaveTextContent('root / second');
  fireEvent.click(location);
  expect(onSelectNodePath).toHaveBeenCalledWith('beta');
});
