import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { createOutlineFixture } from '../features/editor/model/documentOutlineNavigation.testSupport';
import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionReadingActivity } from './companionReadingActivity';
import { OutlineSheet } from './CompanionReadingSheets';

function renderOutline(fixture = createOutlineFixture(), activity?: CompanionReadingActivity) {
  const onSelect = vi.fn();
  const onOpenNode = vi.fn();
  const onOpenChange = vi.fn();
  const sheet = (open: boolean) => <OutlineSheet content={fixture.article().content} nodeId="node-1" snapshot={fixture.snapshot}
    textAnchorDecorations={fixture.article().textAnchorDecorations} {...(activity ? { activity } : {})}
    open={open} onOpenChange={onOpenChange} onSelect={onSelect} onOpenNode={onOpenNode} />;
  const view = renderWithLocalization(sheet(true));
  return { ...view, sheet, onSelect, onOpenNode, onOpenChange };
}

it('uses object icons only for Topic and Item rows and leaves chapter labels unadorned', () => {
  renderOutline();
  expect(screen.getByRole('button', { name: 'Chapter', exact: true }).querySelector('svg, [data-node-icon]')).toBeNull();
  for (const name of ['Alpha passage', 'Beta passage']) {
    const button = screen.getByRole('button', { name });
    expect(button.querySelector('[data-node-icon]')).not.toBeNull();
    expect(button.querySelector('.lucide-map-pin, .lucide-arrow-up-right')).toBeNull();
  }
});

it('shows headings and direct content together and keeps count clicks separate from navigation', () => {
  const { onSelect, onOpenNode } = renderOutline();
  expect(screen.queryByRole('tab')).toBeNull();
  expect(screen.getByRole('button', { name: 'Chapter', exact: true })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Detail', exact: true })).toBeVisible();
  const toggle = screen.getByRole('button', { name: 'Toggle content for Chapter (1)' });
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(toggle);
  expect(screen.queryByRole('button', { name: 'Alpha passage' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Detail', exact: true })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Beta passage' })).toBeVisible();
  expect(onSelect).not.toHaveBeenCalled();
  expect(onOpenNode).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Chapter', exact: true }));
  expect(onSelect).toHaveBeenCalledWith({ from: 19, to: 26 });
});

it('locates a direct Highlight but opens an Item or an unlocated Topic as a card', async () => {
  const { onSelect, onOpenNode, onOpenChange } = renderOutline();
  fireEvent.click(screen.getByRole('button', { name: 'Alpha passage' }));
  expect(onSelect).toHaveBeenCalledWith({ from: 28, to: 41 });
  expect(onOpenNode).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Beta passage' }));
  await waitFor(() => expect(onOpenNode).toHaveBeenCalledExactlyOnceWith('item'));
  expect(onOpenChange).toHaveBeenCalledWith(false);
  fireEvent.click(screen.getByRole('button', { name: 'Manual topic' }));
  await waitFor(() => expect(onOpenNode).toHaveBeenLastCalledWith('manual'));
});

it('waits for reading work, suppresses duplicate clicks and keeps failed opening retryable', async () => {
  const activity = new CompanionReadingActivity('node-1', () => {});
  let finish!: () => void;
  activity.flushDraft = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const { onOpenNode } = renderOutline(createOutlineFixture(), activity);
  const item = screen.getByRole('button', { name: 'Beta passage' });
  fireEvent.click(item);
  fireEvent.click(item);
  await waitFor(() => expect(finish).toBeDefined());
  expect(onOpenNode).not.toHaveBeenCalled();
  expect(item).toBeDisabled();
  finish();
  await waitFor(() => expect(onOpenNode).toHaveBeenCalledTimes(1));
  activity.flushDraft = async () => { throw new Error('save_failed'); };
  fireEvent.click(item);
  expect(await screen.findByRole('alert')).toHaveTextContent('Finish or retry');
  expect(onOpenNode).toHaveBeenCalledTimes(1);
  activity.flushDraft = async () => {};
  fireEvent.click(item);
  await waitFor(() => expect(onOpenNode).toHaveBeenCalledTimes(2));
});

it('cancels pending opening after closing and resets section expansion when reopened', async () => {
  const activity = new CompanionReadingActivity('node-1', () => {});
  let finish!: () => void;
  activity.flushDraft = () => new Promise(resolve => { finish = resolve; });
  const view = renderOutline(createOutlineFixture(), activity);
  fireEvent.click(screen.getByRole('button', { name: 'Toggle content for Chapter (1)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Beta passage' }));
  await waitFor(() => expect(finish).toBeDefined());
  view.rerender(view.sheet(false));
  await act(async () => { finish(); });
  expect(view.onOpenNode).not.toHaveBeenCalled();
  view.rerender(view.sheet(true));
  expect(screen.getByRole('button', { name: 'Alpha passage' })).toBeVisible();
});

it('shows empty content without creating a synthetic heading', () => {
  const fixture = createOutlineFixture('No headings or anchors');
  fixture.snapshot.nodeOrder = ['node-1'];
  renderOutline(fixture);
  expect(screen.getByText('No headings or related topics and items')).toBeVisible();
  expect(screen.queryByRole('tab')).toBeNull();
});

it('expands one derived generation at a time and opens deeper cards without locating them in the root text', async () => {
  const fixture = createOutlineFixture();
  fixture.add('child', 'Child Topic', 'topic', 'alpha');
  fixture.add('grandchild', 'Grandchild Item', 'item', 'child');
  const view = renderOutline(fixture);
  const chapter = screen.getByRole('button', { name: 'Toggle content for Chapter (1)' });
  expect(screen.queryByRole('button', { name: 'Child Topic', exact: true })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Toggle content for Alpha passage (1)' }));
  expect(screen.getByRole('button', { name: 'Child Topic', exact: true })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Grandchild Item', exact: true })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Toggle content for Child Topic (1)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Grandchild Item', exact: true }));
  await waitFor(() => expect(view.onOpenNode).toHaveBeenCalledExactlyOnceWith('grandchild'));
  expect(view.onSelect).not.toHaveBeenCalled();
  fireEvent.click(chapter);
  expect(screen.queryByRole('button', { name: 'Child Topic', exact: true })).toBeNull();
  expect(screen.getByRole('button', { name: 'Detail', exact: true })).toBeVisible();
  fireEvent.click(chapter);
  expect(screen.getByRole('button', { name: 'Grandchild Item', exact: true })).toBeVisible();
  view.rerender(view.sheet(false));
  view.rerender(view.sheet(true));
  expect(screen.queryByRole('button', { name: 'Child Topic', exact: true })).toBeNull();
});

it('uses fresh membership while a card opening waits for a save', async () => {
  const fixture = createOutlineFixture();
  const activity = new CompanionReadingActivity('node-1', () => {});
  let finish!: () => void;
  activity.flushDraft = () => new Promise(resolve => { finish = resolve; });
  const view = renderOutline(fixture, activity);
  fireEvent.click(screen.getByRole('button', { name: 'Beta passage' }));
  await waitFor(() => expect(finish).toBeDefined());
  fixture.snapshot.nodesById.item = { ...fixture.snapshot.nodesById.item!, deletedAt: '2026-11-05T00:00:00Z' };
  view.rerender(view.sheet(true));
  expect(screen.queryByRole('button', { name: 'Beta passage' })).toBeNull();
  await act(async () => { finish(); });
  expect(view.onOpenNode).not.toHaveBeenCalled();
});
