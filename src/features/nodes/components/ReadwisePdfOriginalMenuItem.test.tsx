import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../shared/localization/testLocalization';
import { READWISE_ORIGINAL_FILE_LOADED_EVENT } from '../../../shared/platform/import/readwiseOriginalFileLoadedEvent';

const mocks = vi.hoisted(() => ({ get: vi.fn(), load: vi.fn(), notice: vi.fn(), refresh: vi.fn() }));
vi.mock('../../../shared/platform/import/readwisePdfOriginalRuntimeRepository', () => ({
  getRuntimeReadwisePdfOriginal: mocks.get,
  loadRuntimeReadwisePdfOriginalActionState: mocks.load
}));
vi.mock('../../../shared/platform/import/readwiseOriginalEpubRuntimeRepository', () => ({
  loadRuntimeReadwiseOriginalEpubActionState: async (nodeId: string) => ({ node_id: nodeId, status: 'not_applicable' }),
  useRuntimeReadwiseOriginalEpub: vi.fn()
}));
vi.mock('../../../shared/platform/import/readwiseSourceResyncRuntimeRepository', () => ({
  loadRuntimeReadwiseSourceResyncActionState: async (nodeId: string) => ({
    body_authority: null, category: null, node_id: nodeId, status: 'not_applicable'
  }),
  resyncRuntimeReadwiseSource: vi.fn()
}));
vi.mock('../../../store/workspaceRefreshScheduler', () => ({ refreshWorkspaceState: mocks.refresh }));
vi.mock('../../../shared/ui/AppRuntimeNotice', () => ({ showAppRuntimeNotice: mocks.notice }));

import { NodeListContextMenu } from './NodeListContextMenu';

function Menu() {
  return <NodeListContextMenu createCommands={[]} isTrashMenu={false} left={0} onClose={vi.fn()}
    onCreateCommand={vi.fn()} onDeleteNode={vi.fn()} onDeleteNodePermanently={vi.fn()}
    onRestoreNode={vi.fn()} readwiseOriginalEpubTargetId="pdf" showDeleteAction={false} top={0} />;
}

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue({ node_id: 'pdf', status: 'completed' });
  mocks.load.mockReset().mockResolvedValue({ node_id: 'pdf', status: 'ready' });
  mocks.notice.mockReset();
  mocks.refresh.mockReset().mockResolvedValue(undefined);
});

it('gets the PDF from the Topic menu and refreshes its reader after success', async () => {
  const loaded = vi.fn();
  window.addEventListener(READWISE_ORIGINAL_FILE_LOADED_EVENT, loaded);
  try {
    renderWithLocalization(<Menu />);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Get original PDF' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledWith('readwise-book-load'));
    expect(loaded).toHaveBeenCalledTimes(1);
    expect(mocks.get).toHaveBeenCalledWith('pdf');
  } finally {
    window.removeEventListener(READWISE_ORIGINAL_FILE_LOADED_EVENT, loaded);
  }
});

it('does not refresh the reader when Readwise has no original', async () => {
  mocks.get.mockResolvedValue({ node_id: 'pdf', status: 'failed', error_code: 'original_file_not_distributed' });
  renderWithLocalization(<Menu />);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Get original PDF' }));
  await waitFor(() => expect(mocks.notice).toHaveBeenLastCalledWith(
    'Readwise did not provide the original PDF. The topic is unchanged.', 'error'
  ));
  expect(mocks.refresh).not.toHaveBeenCalled();
});
