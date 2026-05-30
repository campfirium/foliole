import { useLayoutEffect, useRef } from 'react';

import {
  isEditorInputDiagnosticEnabled,
  logEditorInputDiagnostic,
  readEditorInputDiagnosticTime,
  type EditorInputDiagnosticDetails
} from '../../store/workspaceEditorInputDiagnostics';

export type DiagnosticValue = boolean | number | string | null | undefined | object;

function normalizeDiagnosticValues(values: Record<string, DiagnosticValue>) {
  const details: EditorInputDiagnosticDetails = {};
  for (const [key, value] of Object.entries(values)) {
    details[key] = typeof value === 'object' ? String(value !== null) : value;
  }
  return details;
}

export function useWorkspaceRenderDiagnostic(
  event: string,
  values: Record<string, DiagnosticValue>
) {
  const previousRef = useRef<Record<string, DiagnosticValue> | null>(null);
  if (!isEditorInputDiagnosticEnabled()) {
    previousRef.current = values;
    return;
  }
  const previous = previousRef.current;
  const details = normalizeDiagnosticValues(values);
  for (const [key, value] of Object.entries(values)) {
    details[`${key}Changed`] = Boolean(previous && previous[key] !== value);
  }
  logEditorInputDiagnostic(event, details);
  previousRef.current = values;
}

export function useWorkspaceFrameDiagnostic(
  event: string,
  values: Record<string, DiagnosticValue>,
  dependencies: readonly unknown[]
) {
  const sampleIdRef = useRef(0);
  useLayoutEffect(() => {
    if (!isEditorInputDiagnosticEnabled() || typeof requestAnimationFrame !== 'function') {
      return;
    }
    sampleIdRef.current += 1;
    const sampleId = sampleIdRef.current;
    const committedAt = readEditorInputDiagnosticTime();
    const details = normalizeDiagnosticValues(values);
    let secondFrameHandle = 0;
    const firstFrameHandle = requestAnimationFrame(() => {
      const firstFrameAt = readEditorInputDiagnosticTime();
      logEditorInputDiagnostic(`${event}-first-frame`, {
        ...details,
        commitToFrameMs: firstFrameAt - committedAt,
        sampleId
      });
      secondFrameHandle = requestAnimationFrame(() => {
        const secondFrameAt = readEditorInputDiagnosticTime();
        logEditorInputDiagnostic(`${event}-second-frame`, {
          ...details,
          commitToSecondFrameMs: secondFrameAt - committedAt,
          frameGapMs: secondFrameAt - firstFrameAt,
          sampleId
        });
      });
    });
    return () => {
      cancelAnimationFrame(firstFrameHandle);
      if (secondFrameHandle) {
        cancelAnimationFrame(secondFrameHandle);
      }
    };
  }, dependencies);
}

export function measureWorkspaceDiagnostic<T>(
  event: string,
  details: EditorInputDiagnosticDetails,
  run: () => T
) {
  if (!isEditorInputDiagnosticEnabled()) {
    return run();
  }
  const startedAt = readEditorInputDiagnosticTime();
  const result = run();
  logEditorInputDiagnostic(event, {
    ...details,
    totalMs: readEditorInputDiagnosticTime() - startedAt
  });
  return result;
}

export function startWorkspaceDiagnostic(
  event: string,
  details: Record<string, DiagnosticValue>
) {
  if (!isEditorInputDiagnosticEnabled()) {
    return () => {};
  }
  const startedAt = readEditorInputDiagnosticTime();
  const normalizedDetails = normalizeDiagnosticValues(details);
  return (extraDetails: EditorInputDiagnosticDetails = {}) => {
    logEditorInputDiagnostic(event, {
      ...normalizedDetails,
      ...extraDetails,
      totalMs: readEditorInputDiagnosticTime() - startedAt
    });
  };
}
