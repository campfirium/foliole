import { DEFAULT_CANDIDATE_SOURCE_REF } from './multi-device-sync-source-ref.mjs';

const WINDOWS_DEV_CONTROL = 'scripts/windows/windows-dev-control.mjs';

export function windowsSyncGroupTargetRef(sourceRef = DEFAULT_CANDIDATE_SOURCE_REF) {
  if (sourceRef !== DEFAULT_CANDIDATE_SOURCE_REF) {
    throw new Error(`No Windows acceptance route owns ${sourceRef}`);
  }
  return sourceRef;
}

export function windowsSyncGroupCommand(action, sourceRef = DEFAULT_CANDIDATE_SOURCE_REF) {
  windowsSyncGroupTargetRef(sourceRef);
  if (action === 'multi-device-sync-candidate') {
    return [WINDOWS_DEV_CONTROL, action, '--source-ref', sourceRef];
  }
  return [WINDOWS_DEV_CONTROL, action];
}
