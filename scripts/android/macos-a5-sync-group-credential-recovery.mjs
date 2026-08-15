import path from 'node:path';

import { runMacosA5PairSync } from './macos-a5-pair-sync-action.mjs';
import {
  T132_A5_IDENTITY, T132_A5_LEGACY_MEMBER_IDENTITY, T132_MAC_IDENTITY,
  validateT132CredentialRecoveryDesktop
} from './macos-a5-sync-group-rejoin-contract.mjs';

export function recoverExistingT132Credential({
  buildIdentity, env, evidenceRoot, execute, instrumentationModeArgs, paths, serial
}) {
  return runMacosA5PairSync({ buildIdentity, credentialRepairRequired: true,
    desktopControl: async () => ({ code: 0, output: '' }),
    deviceFingerprint: T132_A5_IDENTITY, existingPairing: false, env,
    evidenceRoot: path.join(evidenceRoot, 'credential-recovery'), execute, paths,
    instrumentationModeArgs,
    pairedDeviceFingerprint: T132_A5_LEGACY_MEMBER_IDENTITY,
    pairRequestFingerprint: T132_A5_IDENTITY,
    remotePeerFingerprint: T132_MAC_IDENTITY, serial,
    validateDesktop: validateT132CredentialRecoveryDesktop });
}
