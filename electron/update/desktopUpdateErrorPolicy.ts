export type DesktopUpdateFailureKind = 'structural' | 'transient';
export type DesktopUpdateFailureStage = 'check' | 'download';

const STRUCTURAL_ERROR_PATTERN = /checksum|code signature|sha512|signature verification|yaml|metadata.*invalid|unsupported platform|unsupported architecture/iu;
const STRUCTURAL_ERROR_CODES = new Set(['ERR_UPDATER_CHANNEL_FILE_NOT_FOUND']);

export function classifyDesktopUpdateFailure(error: unknown): DesktopUpdateFailureKind {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : '';
  if (STRUCTURAL_ERROR_CODES.has(code)) return 'structural';
  const message = error instanceof Error ? error.message : String(error ?? '');
  return STRUCTURAL_ERROR_PATTERN.test(message) ? 'structural' : 'transient';
}

export function desktopUpdateDiagnosticLabel(
  stage: DesktopUpdateFailureStage,
  kind: DesktopUpdateFailureKind | 'retry-exhausted'
) {
  return `desktop_update_${stage}_${kind.replace('-', '_')}`;
}
