import { useEffect } from 'react';
import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { FormulaClozeCreatePayload, FormulaClozeSourcePayload } from '../../features/formula-cloze/model/formulaCloze';
import { buildFormulaClozeSourcePayload } from '../../features/formula-cloze/model/formulaCloze';
import {
  FORMULA_CLOZE_CREATE_EVENT,
  type FormulaClozeCreateEventDetail
} from '../../features/formula-cloze/model/formulaClozeEvents';
import type { Node } from '../../features/nodes/model/nodeTypes';

export function useFormulaClozeEventBridge(args: {
  activeNode?: Node;
  activeNodeId: string | null;
  createFormulaClozeNode: (
    parentNodeId: string,
    payload: FormulaClozeCreatePayload,
    sourcePayload: FormulaClozeSourcePayload
  ) => Promise<string | null> | string | null;
  editorRef: MutableRefObject<EditorAdapter | null>;
  flushPendingEditorDraft: () => boolean;
}) {
  useEffect(() => {
    const handleFormulaClozeCreate = (event: Event) => {
      const detail = (event as CustomEvent<FormulaClozeCreateEventDetail>).detail;
      if (!args.activeNodeId || !detail?.occurrenceKey) {
        return;
      }

      const sourcePayload = buildFormulaClozeSourcePayload(
        args.editorRef.current?.getContent() ?? args.activeNode?.content ?? '',
        detail.formulaRange
      );
      if (sourcePayload) {
        args.flushPendingEditorDraft();
        args.createFormulaClozeNode(args.activeNodeId, detail, sourcePayload);
      }
    };

    window.addEventListener(FORMULA_CLOZE_CREATE_EVENT, handleFormulaClozeCreate as EventListener);
    return () => {
      window.removeEventListener(FORMULA_CLOZE_CREATE_EVENT, handleFormulaClozeCreate as EventListener);
    };
  }, [args]);
}
