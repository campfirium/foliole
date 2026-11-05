import { fireEvent, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { OutlineSheet } from './CompanionReadingSheets';

const nodesById = { topic: { kind: 'topic' as const }, item: { kind: 'item' as const } };
const decorations = [
  { from: 0, to: 5, kind: 'highlight' as const, nodeId: 'topic' },
  { from: 6, to: 10, kind: 'cloze' as const, nodeId: 'item' }
];

it.each([
  { content: '# Heading\nAlpha Beta', anchors: decorations, expected: 'Outline' },
  { content: 'Alpha Beta', anchors: decorations, expected: 'Topic' },
  { content: 'Alpha Beta', anchors: decorations.slice(1), expected: 'Item' },
  { content: 'Alpha Beta', anchors: [], expected: 'Outline' }
])('selects $expected on opening without navigating', ({ content, anchors, expected }) => {
  const select = vi.fn();
  renderWithLocalization(<OutlineSheet content={content} nodesById={nodesById} textAnchorDecorations={anchors}
    open onOpenChange={vi.fn()} onSelect={select} />);
  expect(screen.getByRole('tab', { name: expected })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getAllByRole('tab')).toHaveLength(3);
  expect(select).not.toHaveBeenCalled();
  if (!anchors.length) expect(screen.getByText('No headings in this topic')).toBeVisible();
});

it('allows empty tabs and keyboard changes, then recomputes priority on reopening', () => {
  const select = vi.fn();
  const sheet = (open: boolean) => <OutlineSheet content="Alpha Beta" nodesById={nodesById}
    textAnchorDecorations={decorations.slice(1)} open={open} onOpenChange={vi.fn()} onSelect={select} />;
  const view = renderWithLocalization(sheet(true));
  fireEvent.click(screen.getByRole('tab', { name: 'Topic' }));
  expect(screen.getByText('No topic locations in this text')).toBeVisible();
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Topic' }), { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: 'Item' })).toHaveFocus();
  expect(within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Beta' })).toBeVisible();
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Item' }), { key: 'Home' });
  expect(screen.getByText('No headings in this topic')).toBeVisible();
  expect(select).not.toHaveBeenCalled();
  view.rerender(sheet(false));
  view.rerender(sheet(true));
  expect(screen.getByRole('tab', { name: 'Item' })).toHaveAttribute('aria-selected', 'true');
});

it('keeps an empty Item page available without fabricating a location', () => {
  renderWithLocalization(<OutlineSheet content="Body" open onOpenChange={vi.fn()} onSelect={vi.fn()} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Item' }));
  expect(screen.getByText('No item locations in this text')).toBeVisible();
  expect(within(screen.getByRole('tabpanel')).queryByRole('button')).toBeNull();
});
