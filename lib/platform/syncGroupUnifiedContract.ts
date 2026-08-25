export const UNIFIED_DESKTOP_SCHEMA_VERSION = 78;
export const UNIFIED_COMPANION_SCHEMA_VERSION = 33;
export const UNIFIED_MIGRATION_CONTRACT_VERSION = 1;

export type UnifiedGroupBindingState = 'active' | 'departed' | 'repair';
export type UnifiedIdentityState = 'verified' | 'legacy_identity_unverified';
export type UnifiedMemberRole = 'manager' | 'member';
export type UnifiedMemberState = 'active' | 'left' | 'repair' | 'revoked';
export type UnifiedRepairReason =
  | 'credential_conflict'
  | 'identity_repair_required'
  | 'manager_repair_required'
  | 'route_reauthorization_required';

export interface LegacyUnifiedMemberSnapshot {
  authorization_id: string;
  display_name: string;
  host_platform: string;
  joined_at: string;
  legacy_member_key: string;
  state: 'active' | 'left' | 'provisioning';
}

export interface LegacyUnifiedGroupSnapshot {
  created_at: string;
  created_by_member_key: string;
  display_name: string;
  group_id: string;
  members: LegacyUnifiedMemberSnapshot[];
  timeline_id: string;
}

export interface LegacyUnifiedLibrarySnapshot {
  groups: LegacyUnifiedGroupSnapshot[];
  library_id: string;
  singleton_group_id: string | null;
  user_version: number;
}

export interface LegacySecureCredentialEvidence {
  authorization_id: string;
  credential_fingerprint: string;
  group_id: string;
  kind: 'local-authorization' | 'peer-route';
  legacy_member_key: string;
}

export interface UnifiedMigrationMemberDecision {
  authorization_id: string;
  authorization_epoch: number;
  display_name: string;
  identity_state: UnifiedIdentityState;
  installation_id: string | null;
  legacy_member_key: string;
  member_id: string;
  platform: string;
  repair_reasons: UnifiedRepairReason[];
  role: UnifiedMemberRole;
  state: UnifiedMemberState;
}

export interface UnifiedMigrationLibraryDecision {
  binding_state: UnifiedGroupBindingState | null;
  group_created_at: string | null;
  group_display_name: string | null;
  group_id: string | null;
  library_id: string;
  local_member_id: string | null;
  manager_member_id: string | null;
  members: UnifiedMigrationMemberDecision[];
  repair_reasons: UnifiedRepairReason[];
  roster_revision: number;
  timeline_id: string | null;
}

export interface UnifiedMigrationDecision {
  active_binding: UnifiedInstallationBinding | null;
  contract_version: typeof UNIFIED_MIGRATION_CONTRACT_VERSION;
  installation_id: string;
  libraries: UnifiedMigrationLibraryDecision[];
  secure_credential_count: number;
}

export interface UnifiedInstallationBinding {
  group_id: string;
  installation_id: string;
  library_id: string;
  local_member_id: string;
  state: 'active';
  timeline_id: string;
}

export interface UnifiedSecureStoreSnapshot {
  credential_count: number;
  digest: string;
  sealed_locator: string;
}

export type UnifiedMigrationJournalPhase =
  | 'prepared'
  | 'databases_applied'
  | 'committed'
  | 'rolling_back';

export interface UnifiedMigrationJournal {
  decision_digest: string;
  journal_id: string;
  phase: UnifiedMigrationJournalPhase;
  previous_registry: UnifiedInstallationRegistrySnapshot;
  secure_snapshot: UnifiedSecureStoreSnapshot;
  updated_at: string;
}

export interface UnifiedInstallationRegistrySnapshot {
  active_binding: UnifiedInstallationBinding | null;
  installation_id: string | null;
  journal: UnifiedMigrationJournal | null;
  revision: number;
}

export const EMPTY_UNIFIED_INSTALLATION_REGISTRY: UnifiedInstallationRegistrySnapshot = {
  active_binding: null,
  installation_id: null,
  journal: null,
  revision: 0
};
