export type DesktopUpdateFailureKind = 'structural' | 'transient';
export type DesktopUpdateFailureStage = 'check' | 'download';

const STRUCTURAL_ERROR_PATTERN = /checksum|code signature|sha512|signature verification|yaml|metadata.*invalid|unsupported platform|unsupported architecture/iu;

export function classifyDesktopUpdateFailure(error: unknown): DesktopUpdateFailureKind {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return STRUCTURAL_ERROR_PATTERN.test(message) ? 'structural' : 'transient';
}

export function desktopUpdateDiagnosticLabel(
  stage: DesktopUpdateFailureStage,
  kind: DesktopUpdateFailureKind | 'retry-exhausted'
) {
  return `desktop_update_${stage}_${kind.replace('-', '_')}`;
}
