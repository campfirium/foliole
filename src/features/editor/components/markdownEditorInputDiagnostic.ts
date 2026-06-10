import { useRef } from 'react';

import {
  isEditorInputDiagnosticEnabled,
  logEditorInputDiagnostic,
  readEditorInputDiagnosticTime,
  type EditorInputDiagnosticDetails
} from '../../../store/workspaceEditorInputDiagnostics';

type DiagnosticValue = boolean | number | string | null | undefined | object;
type MarkdownEditorDiagnosticProps = {
  nodeId: string | null;
  readOnly?: boolean;
  textAnchorDecorations?: readonly unknown[];
  value: string;
};

export function startMarkdownEditorDiagnostic(
  event: string,
  details: EditorInputDiagnosticDetails
) {
  if (!isEditorInputDiagnosticEnabled()) {
    return () => {};
  }
  const startedAt = readEditorInputDiagnosticTime();
  return (extraDetails: EditorInputDiagnosticDetails = {}) => {
    logEditorInputDiagnostic(event, {
      ...details,
      ...extraDetails,
      totalMs: readEditorInputDiagnosticTime() - startedAt
    });
  };
}

function useMarkdownEditorRenderDiagnostic(
  event: string,
  values: Record<string, DiagnosticValue>
) {
  const previousRef = useRef<Record<string, DiagnosticValue> | null>(null);
  if (!isEditorInputDiagnosticEnabled()) {
    previousRef.current = values;
    return;
  }
  const previous = previousRef.current;
  const details: EditorInputDiagnosticDetails = {};
  for (const [key, value] of Object.entries(values)) {
    details[key] = typeof value === 'object' ? String(value !== null) : value;
    details[`${key}Changed`] = Boolean(previous && previous[key] !== value);
  }
  logEditorInputDiagnostic(event, details);
  previousRef.current = values;
}

export function useMarkdownEditorPropsDiagnostic(props: MarkdownEditorDiagnosticProps) {
  useMarkdownEditorRenderDiagnostic('markdown-editor-render', {
    nodeId: props.nodeId,
    readOnly: props.readOnly ?? false,
    textAnchorDecorations: props.textAnchorDecorations ?? null,
    valueLength: props.value.length
  });
}
