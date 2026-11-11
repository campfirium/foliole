import { afterEach, expect, it, vi } from 'vitest';

import { useWorkspaceStore } from '../../store/workspaceStore';

import { readReviewTopicAfterFlush } from './readReviewTopicAfterFlush';

const initial = useWorkspaceStore.getState();

afterEach(() => {
  useWorkspaceStore.setState(initial);
  delete window.__folioleFlushReadingProgressBeforeClose;
});

function setCurrentReading(nodeId: string) {
  const read = vi.fn().mockResolvedValue(true);
  useWorkspaceStore.setState(state => ({
    nodesById: Object.fromEntries(['a', 'b'].map(id => [id, { id, kind: 'topic', title: id, content: '' }])) as typeof state.nodesById,
    nodeOrder: ['a', 'b'],
    activeNodeId: nodeId,
    reviewSession: { ...state.reviewSession, currentNodeId: nodeId },
    readReviewTopic: read
  }));
  return read;
}

it('waits for the current article position before submitting Read', async () => {
  const read = setCurrentReading('a');
  let finish!: (saved: boolean) => void;
  window.__folioleFlushReadingProgressBeforeClose = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
  const result = readReviewTopicAfterFlush('2026-11-11T08:00:00Z', { releaseSequentialReading: true });
  expect(window.__folioleFlushReadingProgressBeforeClose).toHaveBeenCalledOnce();
  expect(read).not.toHaveBeenCalled();
  finish(true);
  await expect(result).resolves.toBe(true);
  expect(read).toHaveBeenCalledWith('2026-11-11T08:00:00Z', { releaseSequentialReading: true });
});

it('keeps Read attached to its original article while the position is saving', async () => {
  const read = setCurrentReading('a');
  window.__folioleFlushReadingProgressBeforeClose = async () => {
    useWorkspaceStore.setState({ activeNodeId: 'b' });
    return true;
  };
  await expect(readReviewTopicAfterFlush()).resolves.toBe(false);
  expect(read).not.toHaveBeenCalled();
});
