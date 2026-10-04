import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { applySyncIdentityPackWithDbPort } from '../../../../../../lib/core/sync/syncIdentityPackApply.js';
import { parseSyncIdentityPackContainerManifest } from '../../../../../../lib/core/sync/syncIdentityPackManifest.js';
import { NativeCompanionCapabilityUnavailableError,
  requireAvailableCompanionRuntime } from '../../../companionRuntimeCapabilities';
import { runCompanionSyncWriterTask } from '../../../companionSyncWriterQueue';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap';

interface IdentityPackInput {
  expectedPageId?: string;
  hostName: string;
  manifest: unknown;
  packPath: string;
  sourceHostName?: string;
  sourcePeerId: string;
  targetPeerId: string;
}

/** Applies a native checksum-verified v21 database with the shared identity contract. */
export async function applyCompanionSyncIdentityPackPath(input: IdentityPackInput) {
  const runtime = requireAvailableCompanionRuntime('sync-pack-apply');
  if (runtime.kind !== 'android-native' && runtime.kind !== 'ios-native') {
    throw new NativeCompanionCapabilityUnavailableError('sync-pack-apply', runtime.platform);
  }
  return runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter(
    (port) => applyCompanionSyncIdentityPackWithDbPort(port, input)
  ));
}

export async function applyCompanionSyncIdentityPackWithDbPort(port: DbPort,
  input: IdentityPackInput) {
  const manifest = parseSyncIdentityPackContainerManifest(input.manifest, {
    sourcePeerId: input.sourcePeerId, targetPeerId: input.targetPeerId
  });
  if (input.expectedPageId && manifest.identity_page.page_id !== input.expectedPageId) {
    throw new Error('sync_identity_pack_page_changed');
  }
  await port.run(`ATTACH DATABASE '${input.packPath.replaceAll("'", "''")}' AS inc`);
  try {
    return await applySyncIdentityPackWithDbPort(port, manifest, {
      hostName: input.hostName,
      ...(input.sourceHostName ? { sourceHostName: input.sourceHostName } : {})
    });
  } finally {
    await port.run('DETACH DATABASE inc');
  }
}
