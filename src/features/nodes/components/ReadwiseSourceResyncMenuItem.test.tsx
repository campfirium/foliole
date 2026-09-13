import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../shared/localization/testLocalization';

const runtime = vi.hoisted(() => ({
  confirmation: vi.fn(),
  notice: vi.fn(),
  resync: vi.fn(),
  state: { body_authority: 'reader_html', category: 'article', status: 'ready' }
}));

vi.mock('../../../shared/platform/import/readwiseOriginalEpubRuntimeRepository', () => ({
  loadRuntimeReadwiseOriginalEpubActionState: async (nodeId: string) => ({ node_id: nodeId, status: 'not_applicable' }),
  useRuntimeReadwiseOriginalEpub: vi.fn()
}));
vi.mock('../../../shared/platform/import/readwiseSourceResyncRuntimeRepository', () => ({
  loadRuntimeReadwiseSourceResyncActionState: async (nodeId: string) => ({ node_id: nodeId, ...runtime.state }),
  resyncRuntimeReadwiseSource: runtime.resync
}));
vi.mock('../../../shared/ui/appConfirmation', () => ({ requestAppConfirmation: runtime.confirmation }));
vi.mock('../../../shared/ui/AppRuntimeNotice', () => ({ showAppRuntimeNotice: runtime.notice }));

import { NodeListContextMenu } from './NodeListContextMenu';

beforeEach(() => {
  runtime.confirmation.mockReset().mockResolvedValue(false);
  runtime.notice.mockReset();
  runtime.resync.mockReset().mockResolvedValue({ node_id: 'source', status: 'completed' });
  Object.assign(runtime.state, { body_authority: 'reader_html', category: 'article', status: 'ready' });
});

function Menu() {
  return <NodeListContextMenu createCommands={[]} isTrashMenu={false} left={0} onClose={vi.fn()}
    onCreateCommand={vi.fn()} onDeleteNode={vi.fn()} onDeleteNodePermanently={vi.fn()}
    onRestoreNode={vi.fn()} readwiseOriginalEpubTargetId="source" showDeleteAction={false} top={0} />;
}

it('opens the detailed confirmation and cancellation never invokes resync', async () => {
  renderWithLocalization(<Menu />);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Resync from Readwise' }));

  await waitFor(() => expect(runtime.confirmation).toHaveBeenCalledWith(expect.objectContaining({
    confirmLabel: 'Resync',
    description: [
      expect.stringContaining('get this source from Readwise again'),
      expect.stringContaining('Existing highlights, clozes, and notes')
    ],
    title: 'Resync from Readwise'
  })));
  expect(runtime.resync).not.toHaveBeenCalled();
  expect(runtime.notice).not.toHaveBeenCalled();
});

it('warns when an EPUB will switch authority and runs only after confirmation', async () => {
  Object.assign(runtime.state, { body_authority: 'original_epub', category: 'epub', status: 'ready' });
  runtime.confirmation.mockResolvedValue(true);
  renderWithLocalization(<Menu />);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Resync from Readwise' }));

  await waitFor(() => expect(runtime.resync).toHaveBeenCalledTimes(1));
  expect(runtime.confirmation.mock.calls[0]?.[0].description).toEqual(expect.arrayContaining([
    expect.stringContaining('cover, body images, and table of contents'),
    expect.stringContaining('switch it back to content from Readwise')
  ]));
  expect(runtime.notice).toHaveBeenNthCalledWith(1, 'Resyncing from Readwise…');
  expect(runtime.notice).toHaveBeenNthCalledWith(2, 'Resynced from Readwise.', 'info');
});

it('keeps an ineligible source visible with its reason and disables the action', async () => {
  Object.assign(runtime.state, { status: 'source_inactive' });
  renderWithLocalization(<Menu />);
  expect(await screen.findByRole('menuitem', {
    name: 'Resync from Readwise — this device does not handle Readwise imports'
  })).toHaveAttribute('data-disabled');
});
