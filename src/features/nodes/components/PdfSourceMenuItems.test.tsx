import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../shared/localization/testLocalization';

import { NodeListContextMenu } from './NodeListContextMenu';

const { exportNodePdf, loadRuntimeNodeSourceDetails } = vi.hoisted(() => ({
  exportNodePdf: vi.fn(),
  loadRuntimeNodeSourceDetails: vi.fn()
}));
vi.mock('../../../shared/platform/desktop/attachmentPdfActions', () => ({ exportNodePdf }));
vi.mock('../../../shared/platform/nodeSourceRuntimeRepository', () => ({ loadRuntimeNodeSourceDetails }));
vi.mock('./ReadwiseSourceMenuItems', () => ({ ReadwiseSourceMenuItems: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  exportNodePdf.mockResolvedValue({ status: 'saved', path: '/tmp/Paper.pdf' });
});

function Menu({ nodeId }: { nodeId: string }) {
  return <NodeListContextMenu createCommands={[]} isTrashMenu={false} left={0}
    onClose={vi.fn()} onCreateCommand={vi.fn()} onDeleteNode={vi.fn()}
    onDeleteNodePermanently={vi.fn()} onRestoreNode={vi.fn()}
    pdfExportTargetId={nodeId} showDeleteAction={false} top={0} />;
}

it('exports the PDF linked to the right-clicked source topic', async () => {
  loadRuntimeNodeSourceDetails.mockResolvedValue({
    sourceNodeId: 'topic-1',
    importSource: { sourceKind: 'pdf', sourceLocator: 'foliole-asset://attachment/pdf-hash' }
  });
  renderWithLocalization(<Menu nodeId="topic-1" />);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Export original PDF…' }));
  await waitFor(() => expect(exportNodePdf).toHaveBeenCalledWith('topic-1'));
});

it('does not offer export for an external PDF or a different source topic', async () => {
  loadRuntimeNodeSourceDetails.mockResolvedValue({
    sourceNodeId: 'another-topic',
    importSource: { sourceKind: 'pdf', sourceLocator: '/documents/Paper.pdf' }
  });
  renderWithLocalization(<Menu nodeId="topic-1" />);
  await waitFor(() => expect(loadRuntimeNodeSourceDetails).toHaveBeenCalledWith('topic-1'));
  expect(screen.queryByText('Export original PDF…')).not.toBeInTheDocument();
});
