import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { expect, it, vi } from 'vitest';

import type { FormulaClozeCreatePayload, FormulaClozeSourcePayload } from '../../features/formula-cloze/model/formulaCloze';
import { FORMULA_CLOZE_CREATE_EVENT } from '../../features/formula-cloze/model/formulaClozeEvents';

import { useEditorContextCommands } from './useEditorContextCommands';

const formulaMarkdown = '$E=mc^2$';
const content = `Before ${formulaMarkdown} after`;

function createFormulaPayload(): FormulaClozeCreatePayload {
  const from = content.indexOf(formulaMarkdown);
  return {
    display: 'inline',
    formulaRange: { from, to: from + formulaMarkdown.length },
    formulaSource: formulaMarkdown,
    occurrenceKey: `inline:${from}:${from + formulaMarkdown.length}:E=mc^2`,
    selection: {
      algorithm: 'katex-dom-leaf-v1',
      fallbackRect: { height: 0.4, width: 0.3, x: 0.1, y: 0.2 },
      leaves: [
        {
          path: [0],
          structureFingerprint: 'mord',
          textFingerprint: 'E=mc2'
        }
      ]
    }
  };
}

function renderFormulaClozeCommands(
  createFormulaClozeNode: (
    parentNodeId: string,
    payload: FormulaClozeCreatePayload,
    sourcePayload: FormulaClozeSourcePayload
  ) => string | null
) {
  const editorRef = {
    current: {
      getContent: vi.fn(() => content)
    }
  } as never;
  const nodesById = {
    'node-1': { id: 'node-1', content, title: 'Formula topic' }
  } as never;

  renderHook(() =>
    useEditorContextCommands({
      activeNode: nodesById['node-1']!,
      activeNodeId: 'node-1',
      createChildNode: vi.fn(() => 'note-1'),
      createFormulaClozeNode,
      createHighlightNodeFromSelection: vi.fn(),
      createImageClozeNodes: vi.fn(),
      createQANodeFromSelection: vi.fn(),
      deleteEditorAnnotationNodes: vi.fn(),
      deleteImageClozeRegion: vi.fn(),
      editorRef,
      flushPendingEditorDraft: vi.fn(() => false),
      isTrashViewOpen: false,
      trashedNodeIds: [],
      nodesById,
      onExitImmersiveMode: vi.fn(),
      onSelectNode: vi.fn(),
      updateNodeContent: vi.fn()
    })
  );
}

it('creates a formula cloze item from the formula widget selection event', () => {
  const createFormulaClozeNode = vi.fn(() => 'node-formula-cloze');
  const payload = createFormulaPayload();
  renderFormulaClozeCommands(createFormulaClozeNode);

  act(() => {
    window.dispatchEvent(new CustomEvent(FORMULA_CLOZE_CREATE_EVENT, { detail: payload }));
  });

  expect(createFormulaClozeNode).toHaveBeenCalledWith('node-1', payload, {
    promptContent: formulaMarkdown,
    revealContent: formulaMarkdown
  });
});
