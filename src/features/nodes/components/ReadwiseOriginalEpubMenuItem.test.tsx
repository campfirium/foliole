import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../shared/localization/testLocalization';

const state = vi.hoisted(() => ({ status: 'not_applicable' as string }));
const useOriginal = vi.hoisted(() => vi.fn());
const notice = vi.hoisted(() => vi.fn());
const confirmation = vi.hoisted(() => vi.fn());
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
vi.mock('../../../shared/ui/appConfirmation', () => ({ requestAppConfirmation: confirmation }));
import { NodeListContextMenu } from './NodeListContextMenu';

beforeEach(() => {
  state.status = 'not_applicable';
  useOriginal.mockReset();
  notice.mockReset();
  confirmation.mockReset();
  confirmation.mockResolvedValue(false);
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

it('hides ordinary books and explains why an eligible book action cannot run', async () => {
  const { rerender } = renderWithLocalization(
    <Menu nodeId="ordinary" />
  );
  await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());

  state.status = 'source_inactive';
  rerender(<Menu nodeId="book" />);
  const item = await screen.findByRole('menuitem', {
    name: 'Rebuild from EPUB — this device does not handle Readwise imports'
  });
  expect(item).toHaveAttribute('data-disabled');

  state.status = 'reconnect_required';
  rerender(<Menu nodeId="book-reconnect" />);
  expect(await screen.findByRole('menuitem', {
    name: 'Rebuild from EPUB — reconnect Readwise first'
  })).toHaveAttribute('data-disabled');
});

it('does not request or write anything when rebuild confirmation is cancelled', async () => {
  state.status = 'ready';
  renderWithLocalization(<Menu nodeId="book" />);

  fireEvent.click(await screen.findByRole('menuitem', { name: 'Rebuild from EPUB' }));

  await waitFor(() => expect(confirmation).toHaveBeenCalledWith({
    confirmLabel: 'Rebuild',
    description: 'Foliole will get the EPUB from Readwise and rebuild this book’s text, images, and table of contents. Existing highlights, clozes, and notes will be kept and located again.',
    title: 'Rebuild from EPUB?'
  }));
  expect(useOriginal).not.toHaveBeenCalled();
  expect(notice).not.toHaveBeenCalled();
});

it('runs the existing action once after confirmation and reports the committed result', async () => {
  state.status = 'ready';
  confirmation.mockResolvedValue(true);
  useOriginal.mockImplementation(async () => {
    progress.handler?.({ detail: 'ignored native copy', nodeId: 'book', phase: 'downloading_epub', progress: 0.2 });
    return { node_id: 'book', status: 'completed' };
  });
  renderWithLocalization(<Menu nodeId="book" />);

  fireEvent.click(await screen.findByRole('menuitem', { name: 'Rebuild from EPUB' }));

  await waitFor(() => expect(useOriginal).toHaveBeenCalledWith('book'));
  expect(useOriginal).toHaveBeenCalledTimes(1);
  expect(notice).toHaveBeenNthCalledWith(1, 'Getting original EPUB…');
  expect(notice).toHaveBeenNthCalledWith(2, 'Downloading EPUB…');
  await waitFor(() => expect(notice).toHaveBeenNthCalledWith(3, 'Rebuilt from EPUB.'));
});
