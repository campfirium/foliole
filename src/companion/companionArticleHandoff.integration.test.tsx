import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { saveCompanionContentEditWithDb } from '../shared/platform/companion/editing/companionContentEditing';
import { editableNode, stableEditingHost } from '../shared/platform/companion/editing/companionContentEditingStable.testSupport';

import { ReadingActionsLayer } from './CompanionReadingActionsLayer';
import { CompanionReadingActivity } from './companionReadingActivity';

const { nativeOpen, getOwner } = vi.hoisted(() => ({ nativeOpen: vi.fn(), getOwner: vi.fn() }));
vi.mock('@capacitor/core', async (load) => {
  const core = await load<typeof import('@capacitor/core')>();
  return {
    ...core,
    Capacitor: { ...core.Capacitor, isNativePlatform: () => true, isPluginAvailable: () => true },
    registerPlugin: (name: string) => name === 'FolioleArticleHandoff' ? { open: nativeOpen } : core.registerPlugin(name)
  };
});
vi.mock('../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap', async (load) => ({
  ...await load<object>(), getIosCompanionDatabaseOwner: getOwner
}));

function Actions({ activity, close }: { activity: CompanionReadingActivity; close: () => void }) {
  const node = editableNode();
  const snapshot: WorkspaceSnapshot = {
    nodesById: { topic: node }, activeNodeId: 'topic', nodeOrder: ['topic'], trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
  return <ReadingActionsLayer actionsOpen onOpenActions={close} onFindInDocument={() => {}}
    onOpenReadingSheet={() => {}} handoffContext={{ snapshot, activity, isContentEditing: true }}
    readableArticle={{ title: node.title, nodeId: node.id, bodyStatus: 'ready', content: node.content,
      hideTitleHeading: false, persistedNodeViewState: null, pdfAttachmentId: null, textAnchorDecorations: [] }} />;
}

it.each(['android', 'ios'] as const)('%s hands off the whole saved body and keeps the article available on cancellation or missing targets', async platform => {
  const host = await stableEditingHost(platform);
  getOwner.mockReturnValue(host.owner);
  nativeOpen.mockReset().mockResolvedValueOnce({ status: 'cancelled' }).mockResolvedValueOnce({ status: 'unavailable' })
    .mockResolvedValueOnce({ status: 'presented' });
  const start = '沿河走到旧码头。';
  const middle = '经过石桥，继续向前。'.repeat(3500);
  const end = '这是编辑后新保存的最后一句。';
  const savedContent = `---\nprivate: metadata\n---\n# 沿河走\n\n${start}\n\n${middle}\n\n${end}`;
  const activity = new CompanionReadingActivity('topic', () => {});
  const close = vi.fn();
  await host.seed(editableNode({ title: '沿河走', content: '旧正文' }), 'base');
  let release!: () => void;
  const draft = new Promise<void>(resolve => { release = resolve; });
  activity.flushDraft = async () => {
    await draft;
    await host.owner.runWriter(db => db.transaction(tx => saveCompanionContentEditWithDb(tx, {
      nodeId: 'topic', content: savedContent, baseVersionId: 'base', versionId: 'saved', updatedAt: '2026-11-11T00:00:00Z'
    })));
    activity.flushDraft = null;
  };
  const view = renderWithLocalization(<Actions activity={activity} close={close} />);
  try {
    const share = screen.getByRole('button', { name: 'Share article' });
    fireEvent.click(share);
    fireEvent.click(share);
    expect(nativeOpen).not.toHaveBeenCalled();
    await act(async () => { release(); });
    expect(nativeOpen).toHaveBeenCalledTimes(1);
    const html = nativeOpen.mock.calls[0]?.[0].html as string;
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain(`<h1>沿河走</h1><p>${start}</p>\n<p>${middle}</p>\n<p>${end}</p>`);
    expect(html).not.toMatch(/旧正文|private: metadata/u);
    expect(screen.queryByRole('status')).toBeNull();
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(share);
    await screen.findByText('No app can open the article, or the article has no available text.');
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(share);
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    await host.reopen();
    expect(host.sqlite.prepare("SELECT content FROM nodes WHERE id='topic'").get()).toEqual({ content: savedContent });
  } finally {
    view.unmount();
    await host.close();
  }
});
