import {
  buildT152TwoDeviceProof, writeT152ResourceLocator
} from '../acceptance/t152-two-device-proof-builder.mjs';
import { writeT152TwoDeviceCellReceipt } from '../acceptance/t152-two-device-cell-receipt.mjs';

const ACCEPTANCE_APP_ID = 'com.foliole.android.acceptance';

export function writeMacosA5CellReceipt({ buildIdentity, evidenceRoot, input, macosLibrary }) {
  const a5Locator = writeT152ResourceLocator(evidenceRoot, 'a5', {
    applicationId: ACCEPTANCE_APP_ID, identity: input.devices.a5.identity,
    uninstalledAfterAttempt: true
  });
  const macosLocator = writeT152ResourceLocator(evidenceRoot, 'macos', {
    identity: input.devices.macos.identity, library: macosLibrary
  });
  return writeT152TwoDeviceCellReceipt(buildT152TwoDeviceProof({ ...input,
    builds: { a5: buildIdentity, macos: buildIdentity },
    libraries: [{ locator: macosLocator }, { locator: a5Locator }] }));
}
