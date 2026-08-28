import {
  buildT152TwoDeviceProof, writeT152ResourceLocator
} from '../acceptance/t152-two-device-proof-builder.mjs';
import { writeT152TwoDeviceCellReceipt } from '../acceptance/t152-two-device-cell-receipt.mjs';

export function writeFriTwoDeviceCellReceipt({ applicationId, buildIdentity, evidenceRoot,
  input, providerHost, providerLibrary }) {
  const friLocator = writeT152ResourceLocator(evidenceRoot, 'fri', {
    applicationId, identity: input.devices.fri.identity, isolatedAttemptContainer: true
  });
  const providerLocator = writeT152ResourceLocator(evidenceRoot, providerHost, {
    identity: input.devices[providerHost].identity, library: providerLibrary
  });
  return writeT152TwoDeviceCellReceipt(buildT152TwoDeviceProof({ ...input,
    builds: { fri: buildIdentity, [providerHost]: buildIdentity },
    libraries: [{ locator: providerLocator }, { locator: friLocator }] }));
}
