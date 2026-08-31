import { beforeEach, expect, it, vi } from 'vitest';

const pdfSurfaceMocks = vi.hoisted(() => ({
  requestActivePdfSelectionAnnotation: vi.fn()
}));

vi.mock('../components/pdfSurfaceRegistration', () => pdfSurfaceMocks);

import { createSelectionAnnotationPaletteActions } from './appPaletteSelectionActions';

function createActions() {
  const editorCommands = {
    onCreateCloze: vi.fn(),
    onCreateHighlight: vi.fn(),
    onOpenSelectionNote: vi.fn()
  };
  const actions = createSelectionAnnotationPaletteActions({
    layoutProps: { editorCommands } as never
  });
  return { actions, editorCommands };
}

beforeEach(() => {
  pdfSurfaceMocks.requestActivePdfSelectionAnnotation.mockReset();
});

it.each([
  ['createSelectionHighlight', 'highlight', 'onCreateHighlight'],
  ['createSelectionCloze', 'cloze', 'onCreateCloze'],
  ['addSelectionNote', 'note', 'onOpenSelectionNote']
] as const)('routes %s to the active PDF before the text editor fallback', (action, kind, fallback) => {
  pdfSurfaceMocks.requestActivePdfSelectionAnnotation.mockReturnValue(true);
  const harness = createActions();

  harness.actions[action]();

  expect(pdfSurfaceMocks.requestActivePdfSelectionAnnotation).toHaveBeenCalledWith(kind);
  expect(harness.editorCommands[fallback]).not.toHaveBeenCalled();
});

it('keeps the text editor command when no PDF surface owns the shortcut', () => {
  pdfSurfaceMocks.requestActivePdfSelectionAnnotation.mockReturnValue(false);
  const harness = createActions();

  harness.actions.createSelectionHighlight();

  expect(harness.editorCommands.onCreateHighlight).toHaveBeenCalledOnce();
});
