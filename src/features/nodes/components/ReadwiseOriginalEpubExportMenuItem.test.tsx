import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../shared/localization/testLocalization';

const mocks = vi.hoisted(() => ({
  clearNotice: vi.fn(),
  exportEpub: vi.fn(),
  loadState: vi.fn(),
  showNotice: vi.fn()
}));

vi.mock('../../../shared/platform/import/readwiseOriginalEpubExportRuntimeRepository', () => ({
  exportRuntimeReadwiseOriginalEpub: mocks.exportEpub
}));
vi.mock('../../../shared/platform/import/readwiseOriginalEpubRuntimeRepository', () => ({
  loadRuntimeReadwiseOriginalEpubActionState: mocks.loadState
}));
vi.mock('../../../shared/platform/import/readwiseSourceResyncRuntimeRepository', () => ({
  loadRuntimeReadwiseSourceResyncActionState: async (nodeId: string) => ({
    body_authority: 'reader_html', category: 'epub', node_id: nodeId, status: 'ready'
  }),
  resyncRuntimeReadwiseSource: vi.fn()
}));
vi.mock('../../../shared/ui/AppRuntimeNotice', () => ({
  clearAppRuntimeNotice: mocks.clearNotice,
  showAppRuntimeNotice: mocks.showNotice
}));

import { NodeListContextMenu } from './NodeListContextMenu';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadState.mockResolvedValue({ node_id: 'book', status: 'ready' });
  mocks.exportEpub.mockResolvedValue({ node_id: 'book', path: '/tmp/Book.epub', status: 'saved' });
  mocks.showNotice.mockReturnValue(1);
});

function Menu() {
  return <NodeListContextMenu createCommands={[]} isTrashMenu={false} left={0}
    onClose={vi.fn()} onCreateCommand={vi.fn()} onDeleteNode={vi.fn()}
    onDeleteNodePermanently={vi.fn()} onRestoreNode={vi.fn()}
    readwiseOriginalEpubTargetId="book" showDeleteAction={false} top={0} />;
}

it('offers Readwise EPUB export and reports success after the selected file is saved', async () => {
  renderWithLocalization(<Menu />);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Export original EPUB…' }));
  await waitFor(() => expect(mocks.exportEpub).toHaveBeenCalledWith('book'));
  await waitFor(() => expect(mocks.showNotice).toHaveBeenCalledWith('Original EPUB exported.'));
});

it('does not offer export for an unrelated topic', async () => {
  mocks.loadState.mockResolvedValue({ node_id: 'book', status: 'not_applicable' });
  renderWithLocalization(<Menu />);
  await waitFor(() => expect(mocks.loadState).toHaveBeenCalledWith('book'));
  expect(screen.queryByRole('menuitem', { name: 'Export original EPUB…' })).not.toBeInTheDocument();
});

it('places EPUB export after Readwise resync with one divider before Delete', async () => {
  renderWithLocalization(<NodeListContextMenu createCommands={[]} isTrashMenu={false} left={0}
    onClose={vi.fn()} onCreateCommand={vi.fn()} onDeleteNode={vi.fn()}
    onDeleteNodePermanently={vi.fn()} onRenameNode={vi.fn()} onRestoreNode={vi.fn()}
    readwiseOriginalEpubTargetId="book" showDeleteAction showRenameAction top={0} />);
  const menu = screen.getByRole('menu');
  await within(menu).findByRole('menuitem', { name: 'Export original EPUB…' });
  await within(menu).findByRole('menuitem', { name: 'Resync from Readwise' });
  expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
    'Rename', 'Rebuild from EPUB', 'Resync from Readwise', 'Export original EPUB…', 'Delete'
  ]);
  expect(within(menu).getAllByRole('separator')).toHaveLength(2);
});
