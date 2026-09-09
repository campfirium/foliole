import { DEFAULT_CANDIDATE_SOURCE_REF } from './multi-device-sync-source-ref.mjs';

const T173_CONTROL = 'scripts/acceptance/t173-windows-candidate-control.mjs';
const WINDOWS_DEV_CONTROL = 'scripts/windows/windows-dev-control.mjs';

export function windowsSyncGroupTargetRef(sourceRef = DEFAULT_CANDIDATE_SOURCE_REF) {
  return sourceRef === 'refs/heads/sync' ? sourceRef : 'refs/heads/dev';
}

export function windowsSyncGroupCommand(action, sourceRef = DEFAULT_CANDIDATE_SOURCE_REF) {
  if (sourceRef === 'refs/heads/sync') {
    return [T173_CONTROL, action, '--source-ref', sourceRef];
  }
  if (action === 'multi-device-sync-candidate') {
    return [WINDOWS_DEV_CONTROL, action, '--source-ref', sourceRef];
  }
  if (sourceRef !== DEFAULT_CANDIDATE_SOURCE_REF) {
    throw new Error(`No Windows acceptance route owns ${sourceRef}`);
  }
  return [WINDOWS_DEV_CONTROL, action];
}
