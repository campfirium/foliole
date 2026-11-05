import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { createOutlineFixture } from '../features/editor/model/documentOutlineNavigation.testSupport';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { saveCompanionContentEditWithDb } from '../shared/platform/companion/editing/companionContentEditing';
import { editableNode, stableEditingHost } from '../shared/platform/companion/editing/companionContentEditingStable.testSupport';

import { OutlineSheet } from './CompanionOutlineSheet';
import { CompanionReadingActivity } from './companionReadingActivity';

it.each(['android', 'ios'] as const)('%s saves the current body through SQLite before opening a related card and retains it after reopen', async platform => {
  const host = await stableEditingHost(platform);
  const fixture = createOutlineFixture();
  const original = fixture.article();
  await host.seed(editableNode({ id: 'node-1', content: original.content }), 'base');
  await host.seed(editableNode({ id: 'manual', parentNodeId: 'node-1', content: 'Manual card body' }), 'manual-base');
  const activity = new CompanionReadingActivity('node-1', () => {});
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const savedContent = original.content + '\nSaved before opening a related card.';
  activity.flushDraft = async () => {
    await pending;
    await host.owner.runWriter(db => db.transaction(tx => saveCompanionContentEditWithDb(tx, {
      nodeId: 'node-1', content: savedContent, baseVersionId: 'base', versionId: 'saved', updatedAt: '2026-11-05T00:00:00Z'
    })));
  };
  const onOpenNode = vi.fn((id: string) => {
    expect(host.sqlite.prepare("SELECT content FROM nodes WHERE id='node-1'").get()).toEqual({ content: savedContent });
    expect(host.sqlite.prepare('SELECT content FROM nodes WHERE id=?').get(id)).toEqual({ content: 'Manual card body' });
  });
  const view = renderWithLocalization(<OutlineSheet content={original.content} nodeId={original.nodeId}
    snapshot={fixture.snapshot} textAnchorDecorations={original.textAnchorDecorations} activity={activity}
    open onOpenChange={vi.fn()} onSelect={vi.fn()} onOpenNode={onOpenNode} />);
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Manual topic' }));
    expect(onOpenNode).not.toHaveBeenCalled();
    expect(host.sqlite.prepare("SELECT content FROM nodes WHERE id='node-1'").get()).toEqual({ content: original.content });
    await act(async () => { finish(); });
    await waitFor(() => expect(onOpenNode).toHaveBeenCalledExactlyOnceWith('manual'));
    view.unmount();
    await host.reopen();
    expect(host.sqlite.prepare("SELECT content FROM nodes WHERE id='node-1'").get()).toEqual({ content: savedContent });
    expect(host.sqlite.prepare("SELECT content FROM nodes WHERE id='manual'").get()).toEqual({ content: 'Manual card body' });
  } finally { view.unmount(); await host.close(); }
});
