function exactGroupInfo(value) {
  return value && Object.keys(value).sort().join(',') === 'display_name,group_id,workgroup_key' &&
    value.display_name === 'Acceptance Sync Group' && value.group_id === 'group-t152-ios-runtime' &&
    value.workgroup_key === 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
}

export function verifySyncGroupJoinAcceptance(first, second) {
  if (first?.status !== 'passed' || first.phase !== 'join-observed' ||
      first.request_visible !== true || first.key_unavailable_before_accept !== true ||
      first.acceptance_consumed_once !== true || first.rejection_cleared !== true ||
      first.timeout_cleared !== true || first.pending_before_restart !== true ||
      !exactGroupInfo(first.decrypted_group_info)) {
    throw new Error('iOS Sync Group join request/accept runtime evidence is incomplete.');
  }
  if (second?.status !== 'passed' || second.phase !== 'restart-clean' ||
      second.provider_restarted_clean !== true) {
    throw new Error('iOS Sync Group join restart cleanup evidence is incomplete.');
  }
  return { first, second };
}
