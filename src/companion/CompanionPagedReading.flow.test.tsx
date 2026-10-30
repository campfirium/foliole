import { fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { CompanionFlowEdgeGestures } from './CompanionFlowEdgeGestures';
import { chooseMode, mountPagedArticle, pointer, tap } from './companionPagedReading.test-support';
import { CompanionReadingPageNavigation } from './CompanionReadingPageNavigation';

vi.mock('@/features/editor/components/MarkdownEditor', () => ({ MarkdownEditor: () => <p>Reading body</p> }));
vi.mock('../shared/platform/companion/runtime/companionFlowGestureRegion', () => ({ setCompanionFlowGestureRegion: async () => undefined }));
afterEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); });

it('lets Flow edge taps and vertical swipes page while horizontal swipes still undo', () => {
  const apply = vi.fn();
  function Wrapper({ children }: { children: ReactNode }) {
    return <CompanionReadingPageNavigation>{children}<CompanionFlowEdgeGestures enabled canUndo canRedo onApply={apply} /></CompanionReadingPageNavigation>;
  }
  const { surface } = mountPagedArticle({ wrapper: Wrapper });
  chooseMode('Paged scroll');
  const previous = screen.getByTestId('flow-edge-undo');
  const next = screen.getByTestId('flow-edge-redo');
  for (const element of [previous, next]) element.setPointerCapture = vi.fn();
  tap(next, 370);
  const page = surface.scrollTop;
  expect(page).toBeGreaterThan(0);
  tap(previous, 5);
  expect(surface.scrollTop).toBe(0);
  pointer(previous, 'pointerdown', 5, 500);
  pointer(previous, 'pointermove', 5, 350);
  pointer(previous, 'pointerup', 5, 300);
  expect(surface.scrollTop).toBe(page);
  pointer(previous, 'pointerdown', 5, 300);
  pointer(previous, 'pointermove', 85, 300);
  pointer(previous, 'pointerup', 85, 300);
  expect(apply).toHaveBeenCalledExactlyOnceWith('undo');
  expect(surface.scrollTop).toBe(page);
  chooseMode('Continuous scroll');
  tap(next, 370);
  expect(surface.scrollTop).toBe(page);
  fireEvent.click(next, { detail: 0 });
  expect(apply).toHaveBeenLastCalledWith('redo');
});

it('keeps paging available when no Flow undo or redo action is available', () => {
  function Wrapper({ children }: { children: ReactNode }) {
    return <CompanionReadingPageNavigation>{children}<CompanionFlowEdgeGestures enabled canUndo={false} canRedo={false} onApply={vi.fn()} /></CompanionReadingPageNavigation>;
  }
  const { surface } = mountPagedArticle({ wrapper: Wrapper });
  expect(screen.getByTestId('flow-edge-redo')).toBeDisabled();
  chooseMode('Paged scroll');
  const next = screen.getByTestId('flow-edge-redo');
  expect(next).not.toBeDisabled();
  next.setPointerCapture = vi.fn();
  tap(next, 370);
  expect(surface.scrollTop).toBeGreaterThan(0);
});
