import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { expect, it, vi } from 'vitest';

import { encodePdfReadingPosition } from '../../../lib/platform/pdfReadingPosition';
import type { PdfSystemController } from '../../features/pdf/model/pdfSystemApi';
import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';
import type { WorkspaceSyncAppliedPayload } from '../../shared/platform/electronApi';

import { usePdfReadingResume } from './usePdfReadingResume';
import { WorkspaceRuntimeNotice } from './WorkspaceRuntimeNotice';

const bridge = vi.hoisted(() => ({ load: vi.fn(), subscribe: vi.fn() }));
vi.mock('../../shared/platform/workspaceRuntimeRepository', () => ({ loadReadingResumeFromRuntime: bridge.load }));
vi.mock('../../shared/platform/runtimeShellEvents', () => ({ onWorkspaceSyncApplied: bridge.subscribe }));

const hash = 'a'.repeat(64);
const resume = (page: number, positionY: number) => ({
  nodeId: 'pdf', pdfAttachmentId: hash, contentHash: 'b'.repeat(64), libraryEpoch: 'library',
  clock: {}, offset: encodePdfReadingPosition(page, positionY)
});

it('restores on open and keeps a newer sync position optional while the PDF is visible', async () => {
  const jump = vi.fn();
  const persist = vi.fn();
  let notify!: (payload: WorkspaceSyncAppliedPayload) => void;
  bridge.subscribe.mockImplementation(async (handler: typeof notify) => {
    notify = handler;
    return () => undefined;
  });
  bridge.load.mockResolvedValue(resume(2, 0.4));
  let reading!: ReturnType<typeof usePdfReadingResume>;
  const viewer = { actions: { requestReadingPosition: jump, setVisibleLocation: vi.fn() },
    state: { page: 3, positionY: 0.5 } } as unknown as PdfSystemController;
  function Reader({ visible }: { visible: boolean }) {
    const surfaceRef = useRef<HTMLDivElement>(null);
    reading = usePdfReadingResume({ nodeId: 'pdf', sourceHint: `foliole-asset://attachment/${hash}.pdf`,
      isVisible: visible, pdfSystem: viewer, surfaceRef, onPersistViewState: persist });
    return <div ref={surfaceRef}>
      <div data-testid="pdf-scroll-container"><div data-testid="pdf-document-toolbar"><button>Zoom</button></div></div>
      <WorkspaceRuntimeNotice />
    </div>;
  }
  const view = render(<Reader visible />, { wrapper: LocalizationProvider });
  await waitFor(() => expect(jump).toHaveBeenCalledWith(2, 0.4));
  const sync = async () => {
    await act(async () => notify({ appliedNodeIds: [], appliedReviewOpIds: [],
      appliedObjectIds: ['node_reading_resume:pdf'] }));
  };

  bridge.load.mockResolvedValue(resume(3, 0.4));
  await sync();
  expect(screen.queryByRole('button', { name: 'Jump to position' })).toBeNull();
  bridge.load.mockResolvedValue(resume(10, 0.7));
  await sync();
  expect(jump).toHaveBeenCalledTimes(1);
  view.rerender(<Reader visible={false} />);
  expect(screen.queryByRole('button', { name: 'Jump to position' })).toBeNull();
  view.rerender(<Reader visible />);
  await waitFor(() => expect(jump).toHaveBeenLastCalledWith(10, 0.7));

  bridge.load.mockResolvedValue(resume(12, 0.3));
  await sync();
  fireEvent.click(screen.getByRole('button', { name: 'Jump to position' }));
  expect(jump).toHaveBeenLastCalledWith(12, 0.3);
  const viewState = { scrollTop: 300, selection: { from: 12, to: 150 } };
  reading.persist(viewState);
  expect(persist).toHaveBeenLastCalledWith(viewState, undefined);
  reading.markMovement();
  reading.persist(viewState);
  expect(persist).toHaveBeenLastCalledWith(viewState, resume(12, 0.3));
  fireEvent.wheel(screen.getByTestId('pdf-scroll-container'));
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Zoom' }));
  reading.actions.setVisibleLocation(12, 0.2);
  reading.persist(viewState);
  expect(persist).toHaveBeenLastCalledWith(viewState, undefined);
});
