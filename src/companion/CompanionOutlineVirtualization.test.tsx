import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { createOutlineFixture } from '../features/editor/model/documentOutlineNavigation.testSupport';
import { renderWithLocalization } from '../shared/localization/testLocalization';

import { OutlineSheet } from './CompanionOutlineSheet';

it('windows a dense Outline and keeps row actions bound to the object identity', async () => {
  const metrics = ['clientHeight', 'clientWidth', 'offsetHeight', 'offsetWidth'].map(name =>
    vi.spyOn(HTMLElement.prototype, name as 'clientHeight', 'get').mockReturnValue(300));
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 300));
  const fixture = createOutlineFixture('Dense original');
  fixture.snapshot.nodeOrder = ['node-1'];
  for (let index = 0; index < 1000; index++) fixture.add(`card-${index}`, `Passage ${index}`);
  const onOpenNode = vi.fn();
  const article = fixture.article();
  const view = renderWithLocalization(<OutlineSheet content={article.content} nodeId={article.nodeId}
    snapshot={fixture.snapshot} textAnchorDecorations={article.textAnchorDecorations}
    open onOpenChange={vi.fn()} onSelect={vi.fn()} onOpenNode={onOpenNode} />);
  try {
    const first = await screen.findByRole('button', { name: 'Passage 0' });
    expect(screen.getAllByRole('button', { name: /Passage/ }).length).toBeLessThan(30);
    expect(screen.queryByRole('button', { name: 'Passage 999' })).toBeNull();
    fireEvent.click(first);
    await waitFor(() => expect(onOpenNode).toHaveBeenCalledExactlyOnceWith('card-0'));
  } finally {
    view.unmount();
    for (const metric of metrics) metric.mockRestore();
    rect.mockRestore();
  }
});
