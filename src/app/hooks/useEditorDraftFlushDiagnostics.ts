import {
  isEditorInputDiagnosticEnabled,
  logEditorInputDiagnostic,
  readEditorInputDiagnosticTime
} from '../../store/workspaceEditorInputDiagnostics';

export { isEditorInputDiagnosticEnabled, readEditorInputDiagnosticTime };

export function logDraftFlushDiagnostic(args: {
  contentLength?: number;
  finalizeTitle: boolean;
  flushed: boolean;
  flushStartedAt: number;
  pendingAgeMs: number | null;
}) {
  logEditorInputDiagnostic('draft-flush', {
    contentLength: args.contentLength,
    finalizeTitle: args.finalizeTitle,
    flushed: args.flushed,
    pendingAgeMs: args.pendingAgeMs,
    totalMs: readEditorInputDiagnosticTime() - args.flushStartedAt
  });
}
