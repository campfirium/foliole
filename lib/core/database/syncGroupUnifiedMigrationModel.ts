import type {
  LegacySecureCredentialEvidence,
  LegacyUnifiedGroupSnapshot,
  LegacyUnifiedLibrarySnapshot,
  UnifiedInstallationRegistrySnapshot,
  UnifiedMigrationDecision,
  UnifiedMigrationLibraryDecision,
  UnifiedMigrationMemberDecision,
  UnifiedRepairReason
} from '../../platform/syncGroupUnifiedContract.js';
import { UNIFIED_MIGRATION_CONTRACT_VERSION } from '../../platform/syncGroupUnifiedContract.js';

export interface UnifiedMigrationPreviewInput {
  credentials: LegacySecureCredentialEvidence[];
  current_library_id: string;
  installation_id: string;
  libraries: LegacyUnifiedLibrarySnapshot[];
  registry: UnifiedInstallationRegistrySnapshot;
}

interface ProvenLocalMember {
  group: LegacyUnifiedGroupSnapshot;
  legacyMemberKey: string;
  libraryId: string;
}

export function createUnifiedMigrationDecision(input: UnifiedMigrationPreviewInput): UnifiedMigrationDecision {
  const libraries = [...input.libraries].sort(compareLibrary);
  const proven = libraries.flatMap((library) => provenLocalMembers(library, input.credentials));
  const selected = selectActiveMember(input, proven);
  const decisions = libraries.map((library) => decideLibrary(input, library, selected));
  const active = decisions.find((library) => library.binding_state === 'active');
  return {
    active_binding: active?.group_id && active.timeline_id && active.local_member_id ? {
      group_id: active.group_id,
      installation_id: input.installation_id,
      library_id: active.library_id,
      local_member_id: active.local_member_id,
      state: 'active',
      timeline_id: active.timeline_id
    } : null,
    contract_version: UNIFIED_MIGRATION_CONTRACT_VERSION,
    installation_id: input.installation_id,
    libraries: decisions,
    secure_credential_count: input.credentials.length
  };
}

function decideLibrary(
  input: UnifiedMigrationPreviewInput,
  library: LegacyUnifiedLibrarySnapshot,
  selected: ProvenLocalMember | null
): UnifiedMigrationLibraryDecision {
  const group = library.groups.find((item) => item.group_id === library.singleton_group_id) ?? null;
  if (!group) return emptyDecision(library.library_id);
  const proof = localProof(group, input.credentials);
  const local = proof.member;
  const selectedHere = Boolean(selected && selected.libraryId === library.library_id &&
    selected.group.group_id === group.group_id && selected.legacyMemberKey === local?.legacy_member_key);
  const managerMatches = group.members.filter((member) => member.legacy_member_key === group.created_by_member_key);
  const manager = managerMatches.length === 1 ? managerMatches[0] ?? null : null;
  const repairReasons = libraryRepairReasons(proof.conflict, managerMatches.length);
  const members = group.members.map((member) => decideMember({
    credentials: input.credentials,
    group,
    installationId: input.installation_id,
    localMemberKey: local?.legacy_member_key ?? null,
    managerMemberKey: manager?.legacy_member_key ?? null,
    member,
    selectedHere
  }));
  const localDecision = members.find((member) => member.legacy_member_key === local?.legacy_member_key) ?? null;
  return {
    binding_state: localDecision ? selectedHere ? 'active' : 'departed' : 'repair',
    group_created_at: group.created_at,
    group_display_name: group.display_name,
    group_id: group.group_id,
    library_id: library.library_id,
    local_member_id: localDecision?.member_id ?? null,
    manager_member_id: manager ? memberId(manager.authorization_id) : null,
    members,
    repair_reasons: localDecision ? repairReasons : addReason(repairReasons, 'identity_repair_required'),
    roster_revision: 0,
    timeline_id: group.timeline_id
  };
}

function decideMember(input: {
  credentials: LegacySecureCredentialEvidence[];
  group: LegacyUnifiedGroupSnapshot;
  installationId: string;
  localMemberKey: string | null;
  managerMemberKey: string | null;
  member: LegacyUnifiedGroupSnapshot['members'][number];
  selectedHere: boolean;
}): UnifiedMigrationMemberDecision {
  const local = input.member.legacy_member_key === input.localMemberKey;
  const routes = matchingCredentials(input.credentials, input.group.group_id, input.member.authorization_id,
    input.member.legacy_member_key, 'peer-route');
  let repairs: UnifiedRepairReason[] = [];
  if (!local) repairs = addReason(repairs, 'identity_repair_required');
  if (!local && routes.length !== 1) repairs = addReason(repairs, 'route_reauthorization_required');
  if (new Set(routes.map((route) => route.credential_fingerprint)).size > 1) {
    repairs = addReason(addReason(repairs, 'credential_conflict'), 'route_reauthorization_required');
  }
  return {
    authorization_id: input.member.authorization_id,
    authorization_epoch: 1,
    display_name: input.member.display_name,
    identity_state: local ? 'verified' : 'legacy_identity_unverified',
    installation_id: local ? input.installationId : null,
    legacy_member_key: input.member.legacy_member_key,
    member_id: memberId(input.member.authorization_id),
    platform: input.member.host_platform,
    repair_reasons: repairs,
    role: input.member.legacy_member_key === input.managerMemberKey ? 'manager' : 'member',
    state: local && !input.selectedHere ? 'left' : input.member.state === 'left' ? 'left' : 'active'
  };
}

function provenLocalMembers(
  library: LegacyUnifiedLibrarySnapshot,
  credentials: LegacySecureCredentialEvidence[]
): ProvenLocalMember[] {
  const group = library.groups.find((item) => item.group_id === library.singleton_group_id);
  if (!group) return [];
  const proof = localProof(group, credentials);
  return proof.member && !proof.conflict ? [{
    group,
    legacyMemberKey: proof.member.legacy_member_key,
    libraryId: library.library_id
  }] : [];
}

function selectActiveMember(
  input: UnifiedMigrationPreviewInput,
  proven: ProvenLocalMember[]
): ProvenLocalMember | null {
  const binding = input.registry.active_binding;
  if (binding) {
    return proven.find((item) => item.libraryId === binding.library_id &&
      item.group.group_id === binding.group_id) ?? null;
  }
  return proven.find((item) => item.libraryId === input.current_library_id) ??
    (proven.length === 1 ? proven[0] ?? null : null);
}

function localProof(group: LegacyUnifiedGroupSnapshot, credentials: LegacySecureCredentialEvidence[]) {
  const matches = group.members.filter((member) => matchingCredentials(
    credentials, group.group_id, member.authorization_id, member.legacy_member_key, 'local-authorization'
  ).length > 0);
  return { conflict: matches.length > 1, member: matches.length === 1 ? matches[0] : null };
}

function matchingCredentials(
  credentials: LegacySecureCredentialEvidence[],
  groupId: string,
  authorizationId: string,
  memberKey: string,
  kind: LegacySecureCredentialEvidence['kind']
) {
  return credentials.filter((credential) => credential.kind === kind && credential.group_id === groupId &&
    credential.authorization_id === authorizationId && credential.legacy_member_key === memberKey);
}

function libraryRepairReasons(credentialConflict: boolean, managerMatches: number) {
  let reasons: UnifiedRepairReason[] = [];
  if (credentialConflict) reasons = addReason(reasons, 'credential_conflict');
  if (managerMatches !== 1) reasons = addReason(reasons, 'manager_repair_required');
  return reasons;
}

function emptyDecision(libraryId: string): UnifiedMigrationLibraryDecision {
  return { binding_state: null, group_created_at: null, group_display_name: null,
    group_id: null, library_id: libraryId, local_member_id: null,
    manager_member_id: null, members: [], repair_reasons: [], roster_revision: 0, timeline_id: null };
}

function addReason(reasons: UnifiedRepairReason[], reason: UnifiedRepairReason) {
  return reasons.includes(reason) ? reasons : [...reasons, reason];
}

function memberId(authorizationId: string) {
  return `legacy-member:${authorizationId}`;
}

function compareLibrary(left: LegacyUnifiedLibrarySnapshot, right: LegacyUnifiedLibrarySnapshot) {
  return left.library_id.localeCompare(right.library_id);
}
