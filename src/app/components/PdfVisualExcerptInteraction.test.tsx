import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';
import { preloadTranslationCatalog } from '../../shared/localization/translations';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { PdfVisualExcerptPageLayer } from './PdfVisualExcerptPageLayer';
import { PdfVisualExcerptRuntimeProvider } from './PdfVisualExcerptRuntime';
import { PdfVisualExcerptToolbarControls } from './PdfVisualExcerptToolbarControls';

const deleteAnnotations = vi.fn();

function InteractionHarness() {
  return (
    <LocalizationProvider initialLanguagePreference="en">
      <PdfVisualExcerptRuntimeProvider
        currentPage={1}
        locators={[
          {
            id: 'anchor-1',
            kind: 'image-excerpt',
            label: 'Excerpt',
            nodeId: 'excerpt-1',
            page: 1,
            rects: [{ height: 0.4, width: 0.4, x: 0.2, y: 0.2 }],
            x: 0.2,
            y: 0.2
          }
        ]}
        nodeId="pdf-1"
        rotation={0}
        source="fixture.pdf"
      >
        <div data-testid="page-root">
          <canvas data-testid="pdf-canvas" />
          <div className="textLayer">
            <span data-testid="pdf-text">Words</span>
            <span className="endOfContent" data-testid="pdf-end" />
          </div>
          <PdfVisualExcerptPageLayer pageNumber={1} />
        </div>
      </PdfVisualExcerptRuntimeProvider>
    </LocalizationProvider>
  );
}

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

beforeEach(() => {
  deleteAnnotations.mockReset();
  useWorkspaceStore.setState({
    deleteEditorAnnotationNodes: deleteAnnotations,
    nodesById: {
      'excerpt-1': {
        anchorLink: {
          id: 'anchor-1',
          kind: 'image-excerpt',
          locator: {
            page: 1,
            rects: [{ height: 0.4, width: 0.4, x: 0.2, y: 0.2 }],
            x: 0.2,
            y: 0.2
          }
        },
        content: '![Excerpt](asset://crop.png)\n※ First thought',
        createdAt: '',
        id: 'excerpt-1',
        kind: 'topic',
        parentNodeId: 'pdf-1',
        reveal: null,
        review: null,
        title: 'Excerpt title',
        updatedAt: ''
      }
    }
  });
});

function preparePageRoot() {
  const root = screen.getByTestId('page-root');
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
    bottom: 100,
    height: 100,
    left: 0,
    right: 100,
    top: 0,
    width: 100,
    x: 0,
    y: 0,
    toJSON: () => ({})
  });
  root.setPointerCapture = vi.fn();
  root.hasPointerCapture = vi.fn(() => false);
  return root;
}

function dispatchPointer(target: Element, type: 'pointerdown' | 'pointerup', values: { clientX: number; clientY: number; pointerId: number }) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: values.clientX },
    clientY: { value: values.clientY },
    isPrimary: { value: true },
    pointerId: { value: values.pointerId }
  });
  target.dispatchEvent(event);
}

it('selects a nearby outline and consumes Backspace through annotation history deletion', async () => {
  render(<InteractionHarness />);
  preparePageRoot();

  act(() =>
    dispatchPointer(screen.getByTestId('pdf-canvas'), 'pointerdown', {
      clientX: 20,
      clientY: 40,
      pointerId: 1
    })
  );
  await waitFor(() => expect(screen.getByTestId('pdf-image-excerpt-outline')).toHaveClass('shadow-marker'));
  fireEvent.keyDown(window, { key: 'Backspace' });

  expect(deleteAnnotations).toHaveBeenCalledWith(['excerpt-1']);
});

it('keeps text spans native and treats the auxiliary text-layer element as visual area', async () => {
  render(<InteractionHarness />);
  preparePageRoot();

  dispatchPointer(screen.getByTestId('pdf-text'), 'pointerdown', {
    clientX: 70,
    clientY: 10,
    pointerId: 2
  });
  dispatchPointer(screen.getByTestId('pdf-text'), 'pointerup', {
    clientX: 90,
    clientY: 30,
    pointerId: 2
  });
  expect(screen.queryByTestId('pdf-image-excerpt-error')).not.toBeInTheDocument();

  dispatchPointer(screen.getByTestId('pdf-end'), 'pointerdown', {
    clientX: 70,
    clientY: 10,
    pointerId: 3
  });
  dispatchPointer(screen.getByTestId('pdf-end'), 'pointerup', {
    clientX: 90,
    clientY: 30,
    pointerId: 3
  });
  await waitFor(() => expect(screen.getByTestId('pdf-image-excerpt-error')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
});

it('renders the toolbar excerpt affordance as a non-button status icon', () => {
  render(
    <LocalizationProvider initialLanguagePreference="en">
      <PdfVisualExcerptToolbarControls onToolbarInteraction={vi.fn()} />
    </LocalizationProvider>
  );

  expect(screen.getByRole('img', { name: 'Excerpt' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /excerpt/i })).not.toBeInTheDocument();
});
