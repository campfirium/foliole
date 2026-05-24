import { screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import '../../test/reactPdfMock';

import { baseNode, renderSectionWithProps } from './DocumentPanelSection.imageClozeTestSupport';

const formulaClozePresentation = vi.hoisted(() => ({
  getFormulaClozeAnswerEditorNodeId: vi.fn((editorNodeId: string | null) =>
    editorNodeId ? `${editorNodeId}::answer` : null
  ),
  registerFormulaClozeEditorPresentation: vi.fn(),
  unregisterFormulaClozeEditorPresentation: vi.fn()
}));

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({
    editorDisplayMode: 'preview' as const,
    toggleEditorDisplayMode: vi.fn()
  })
}));

vi.mock('./DocumentPanelBody', () => ({
  DocumentPanelBody: () => <div data-testid="document-panel-body">Document body</div>
}));

vi.mock('../../features/formula-cloze/model/formulaClozePresentation', () => formulaClozePresentation);

vi.mock('./ReadwiseBookActionsPanel', () => ({
  ReadwiseBookActionsPanel: () => null
}));

vi.mock('./useNodeSourceUpdatePreview', () => ({
  useNodeSourceUpdatePreview: () => ({
    isLoading: false,
    value: null
  })
}));

beforeEach(() => {
  formulaClozePresentation.registerFormulaClozeEditorPresentation.mockClear();
  formulaClozePresentation.unregisterFormulaClozeEditorPresentation.mockClear();
});

it('renders formula cloze items through the regular document body with cloze presentation', () => {
  renderSectionWithProps({
    activeNodeId: 'node-1',
    editorNodeId: 'node-1',
    nodesById: {
      'node-1': {
        ...baseNode,
        anchorLink: {
          id: 'region-1',
          kind: 'cloze',
          locator: {
            display: 'block',
            fallbackRect: { height: 0.2, width: 0.3, x: 0.1, y: 0.2 },
            formulaSource: '$$\nE=mc^2\n$$',
            kind: 'formula-region',
            occurrenceKey: 'block:10:22:E=mc^2',
            selection: {
              algorithm: 'katex-dom-leaf-v1',
              fallbackRect: { height: 0.2, width: 0.3, x: 0.1, y: 0.2 },
              leaves: [{ path: [0], structureFingerprint: 'mord', textFingerprint: 'E' }]
            }
          }
        },
        content: '$$\nE=mc^2\n$$',
        hasContent: true,
        kind: 'item',
        reveal: '$$\nE=mc^2\n$$'
      }
    }
  });

  expect(screen.getByTestId('document-panel-body')).toBeInTheDocument();
  expect(formulaClozePresentation.registerFormulaClozeEditorPresentation).toHaveBeenCalledWith(
    'node-1',
    expect.objectContaining({
      canCreate: false,
      hiddenRegionIds: ['region-1'],
      outlinedRegionIds: []
    })
  );
  expect(formulaClozePresentation.registerFormulaClozeEditorPresentation).toHaveBeenCalledWith(
    'node-1::answer',
    expect.objectContaining({
      canCreate: false,
      hiddenRegionIds: [],
      outlinedRegionIds: ['region-1']
    })
  );
});
