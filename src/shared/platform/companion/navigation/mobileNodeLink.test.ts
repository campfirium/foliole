import { describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';
import { buildMobileNodeLink } from '../../../../../lib/platform/mobileNodeLinkContract';

import { canOpenMobileNodeLink, createMobileNodeLinkNavigation } from './mobileNodeLink';

function snapshot(): WorkspaceSnapshot {
  const record = (id: string, kind: 'topic' | 'folder') => ({ id, kind, title: id,
    content: kind === 'topic' ? 'Readable body' : '', parentNodeId: null, anchorLink: null,
    createdAt: '2026-09-20', updatedAt: '2026-09-20', hideTitleHeading: false,
    isTitleManual: false, reading: null, reveal: null, review: null });
  return { activeNodeId: 'topic-A', nodeOrder: ['topic-A', 'folder-A'],
    nodesById: { 'topic-A': record('topic-A', 'topic'), 'folder-A': record('folder-A', 'folder') },
    trashedNodeIds: [], untitledSequenceByParent: {} };
}
const link = (nodeId = 'topic-A', groupId = 'group-A') => buildMobileNodeLink({ nodeId, groupId });

function harness(ready = true) {
  const context = { ready, snapshot: snapshot() as WorkspaceSnapshot | null };
  const open = vi.fn();
  const report = vi.fn();
  const loadGroup = vi.fn(async (): Promise<{ group_id: string } | null> => ({ group_id: 'group-A' }));
  const session = createMobileNodeLinkNavigation({ getContext: () => context, loadGroup, open, report });
  return { context, loadGroup, open, report, session };
}

describe('mobile external navigation', () => {
  it('waits for readiness and selects the latest valid request', async () => {
    const h = harness(false);
    h.session.receive(link());
    h.session.receive(link('folder-A'));
    expect(h.loadGroup).not.toHaveBeenCalled();
    h.context.ready = true;
    await h.session.flush();
    expect(h.open).toHaveBeenCalledExactlyOnceWith('folder-A');
  });
  it('allows subsequent intentional opens with no time threshold', async () => {
    const h = harness();
    h.session.receive(link());
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledTimes(1));
    h.session.receive(link());
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledTimes(2));
  });
  it.each(['wrong_library', 'missing', 'unavailable', 'invalid_link'])('keeps selection on %s', async (failure) => {
    const h = harness();
    if (failure === 'wrong_library') h.loadGroup.mockResolvedValue(null);
    if (failure === 'missing') h.context.snapshot = null;
    if (failure === 'unavailable') h.loadGroup.mockRejectedValue(new Error('storage failed'));
    h.session.receive(failure === 'invalid_link' ? 'file:///tmp/data' : link());
    await vi.waitFor(() => expect(h.report).toHaveBeenCalledWith(failure));
    expect(h.open).not.toHaveBeenCalled();
  });
  it('rejects a different active group even when the node ID exists', async () => {
    const h = harness();
    h.session.receive(link('topic-A', 'group-B'));
    await vi.waitFor(() => expect(h.report).toHaveBeenCalledWith('wrong_library'));
    expect(h.open).not.toHaveBeenCalled();
  });
});

describe('mobile link visibility and cancellation', () => {
  it('uses normalized visibility before the readable selector', () => {
    const state = snapshot();
    state.nodesById['topic-A']!.parentNodeId = 'folder-A';
    state.nodesById['folder-A']!.deletedAt = '2026-09-20';
    expect(canOpenMobileNodeLink(state, 'topic-A')).toBe(false);
    expect(canOpenMobileNodeLink(state, 'folder-A')).toBe(false);
    expect(canOpenMobileNodeLink(state, 'absent')).toBe(false);
  });
  it('opens a known topic with missing body using existing reading semantics', () => {
    const state = snapshot();
    state.nodesById['topic-A']!.content = '';
    state.nodesById['topic-A']!.bodyStatus = 'missing';
    expect(canOpenMobileNodeLink(state, 'topic-A')).toBe(true);
  });
  it('ignores obsolete async completions and checks the current snapshot', async () => {
    const h = harness();
    let resolve!: (group: { group_id: string }) => void;
    h.loadGroup.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    h.session.receive(link());
    h.session.receive(link('folder-A'));
    resolve({ group_id: 'group-A' });
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledExactlyOnceWith('folder-A'));
  });
  it('does not navigate after disposal during group lookup', async () => {
    const h = harness();
    h.session.receive(link());
    h.session.stop();
    await Promise.resolve();
    expect(h.open).not.toHaveBeenCalled();
    expect(h.report).not.toHaveBeenCalled();
  });
});
