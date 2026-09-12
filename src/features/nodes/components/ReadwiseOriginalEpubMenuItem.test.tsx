import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../shared/localization/testLocalization';

const state = vi.hoisted(() => ({ status: 'not_applicable' as string }));
const useOriginal = vi.hoisted(() => vi.fn());
const notice = vi.hoisted(() => vi.fn());
const progress = vi.hoisted(() => ({ handler: null as null | ((event: {
  detail: string; nodeId: string; phase: 'downloading_epub'; progress: number
}) => void) }));

vi.mock('../../../shared/platform/import/readwiseOriginalEpubRuntimeRepository', () => ({
  loadRuntimeReadwiseOriginalEpubActionState: async (nodeId: string) => ({ node_id: nodeId, status: state.status }),
  useRuntimeReadwiseOriginalEpub: useOriginal
}));
vi.mock('../../../shared/platform/readwiseBooksRuntimeRepository', () => ({
  onRuntimeReadwiseBookEpubProgress: (handler: typeof progress.handler) => {
    progress.handler = handler;
    return () => { progress.handler = null; };
  }
}));
vi.mock('../../../shared/ui/AppRuntimeNotice', () => ({ showAppRuntimeNotice: notice }));
import { NodeListContextMenu } from './NodeListContextMenu';

beforeEach(() => {
  state.status = 'not_applicable';
  useOriginal.mockReset();
  notice.mockReset();
  progress.handler = null;
});

function Menu({ nodeId }: { nodeId: string }) {
  return (
    <NodeListContextMenu
      createCommands={[]}
      isTrashMenu={false}
      left={0}
      onClose={vi.fn()}
      onCreateCommand={vi.fn()}
      onDeleteNode={vi.fn()}
      onDeleteNodePermanently={vi.fn()}
      onRestoreNode={vi.fn()}
      readwiseOriginalEpubTargetId={nodeId}
      showDeleteAction={false}
      top={0}
    />
  );
}

it('hides ordinary nodes and explains why an eligible book action cannot run', async () => {
  const { rerender } = renderWithLocalization(
    <Menu nodeId="ordinary" />
  );
  await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());

  state.status = 'source_inactive';
  rerender(<Menu nodeId="book" />);
  const item = await screen.findByRole('menuitem', {
    name: 'Use original EPUB — this device does not handle Readwise imports'
  });
  expect(item).toHaveAttribute('data-disabled');

  state.status = 'reconnect_required';
  rerender(<Menu nodeId="book-reconnect" />);
  expect(await screen.findByRole('menuitem', {
    name: 'Use original EPUB — reconnect Readwise first'
  })).toHaveAttribute('data-disabled');
});

it('runs the one-step action and reports the committed result', async () => {
  state.status = 'ready';
  useOriginal.mockImplementation(async () => {
    progress.handler?.({ detail: 'ignored native copy', nodeId: 'book', phase: 'downloading_epub', progress: 0.2 });
    return { node_id: 'book', status: 'completed' };
  });
  renderWithLocalization(<Menu nodeId="book" />);

  fireEvent.click(await screen.findByRole('menuitem', { name: 'Use original EPUB' }));

  await waitFor(() => expect(useOriginal).toHaveBeenCalledWith('book'));
  expect(notice).toHaveBeenNthCalledWith(1, 'Getting original EPUB…');
  expect(notice).toHaveBeenNthCalledWith(2, 'Downloading EPUB…');
  await waitFor(() => expect(notice).toHaveBeenNthCalledWith(3, 'Original EPUB is now in use.'));
});
