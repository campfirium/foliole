import type { UnifiedLegacySecureStorePort } from '../../lib/core/database/syncGroupUnifiedMigrationCoordinator';
import type { LegacySecureCredentialEvidence, UnifiedSecureStoreSnapshot } from '../../lib/platform/syncGroupUnifiedContract';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract';
import { FolioleCompanionSync } from '../shared/platform/companionWorkspaceRuntimeRepository';

const SIGNING_REQUEST = {
  body_hash: 'sync-group-migration-fixture-body',
  method: 'GET',
  nonce: 'sync-group-migration-fixture-nonce',
  path_with_query: '/acceptance/sync-group-migration',
  timestamp: '2026-08-25T00:00:00.000Z'
} as const;

export class IosMigrationSecureStore implements UnifiedLegacySecureStorePort {
  private signature: string | null = null;
  faultOnVerify = false;

  constructor(private readonly credentials: LegacySecureCredentialEvidence[]) {}

  async prepare() {
    await FolioleCompanionSync.clearPairingCredentials();
    await FolioleCompanionSync.savePairingCredentials({
      authorization_id: 'authorization-v',
      credential_secret: 'sealed-ios-migration-fixture-secret',
      host_name: 'V',
      host_platform: 'windows',
      negotiated_protocol_version: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version,
      paired_at: '2026-08-25T00:00:00.000Z',
      remote_peer_id: 'legacy-member:authorization-v',
      remote_peer_name: 'V',
      remote_peer_platform: 'windows',
      remote_protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
      sync_group_id: 'group-a'
    });
  }

  async inspect() {
    return structuredClone(this.credentials);
  }

  async seal(): Promise<UnifiedSecureStoreSnapshot> {
    this.signature = await this.sign();
    return {
      credential_count: this.credentials.length,
      digest: this.signature,
      sealed_locator: 'ios-keychain:legacy-pairing:acceptance-only'
    };
  }

  async verify(snapshot: UnifiedSecureStoreSnapshot) {
    if (this.faultOnVerify) throw new Error('injected secure-store verification fault');
    if (snapshot.digest !== this.signature || await this.sign() !== this.signature) {
      throw new Error('iOS sealed credential changed during unified migration');
    }
  }

  async restore(snapshot: UnifiedSecureStoreSnapshot) {
    if (snapshot.digest !== this.signature || await this.sign() !== this.signature) {
      throw new Error('iOS sealed credential recovery failed');
    }
  }

  async evidence() {
    const pairing = await FolioleCompanionSync.loadPairingState();
    return {
      authorization_id: pairing.authorization_id,
      credential_signature: await this.sign(),
      is_paired: pairing.is_paired
    };
  }

  private async sign() {
    const signed = await FolioleCompanionSync.signCompanionSyncRequest(SIGNING_REQUEST);
    return signed.headers['X-Signature'];
  }
}
