import { expect, it } from 'vitest';
import { verifySyncGroupJoinAcceptance } from './ios-sync-group-join-acceptance-runner.mjs';

const first = {
  acceptance_consumed_once: true,
  decrypted_group_info: {
    display_name: 'Acceptance Sync Group', group_id: 'group-t152-ios-runtime',
    workgroup_key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
  },
  key_unavailable_before_accept: true, pending_before_restart: true, phase: 'join-observed',
  rejection_cleared: true, request_visible: true, status: 'passed', timeout_cleared: true
};
const second = { phase: 'restart-clean', provider_restarted_clean: true, status: 'passed' };

it('accepts exact request, encrypted group info, cleanup, and restart evidence', () => {
  expect(verifySyncGroupJoinAcceptance(first, second)).toEqual({ first, second });
});

it('rejects extra decrypted group fields and missing cleanup evidence', () => {
  expect(() => verifySyncGroupJoinAcceptance({
    ...first, decrypted_group_info: { ...first.decrypted_group_info, authorization_id: 'legacy' }
  }, second)).toThrow('request/accept runtime evidence is incomplete');
  expect(() => verifySyncGroupJoinAcceptance(first, {
    ...second, provider_restarted_clean: false
  })).toThrow('restart cleanup evidence is incomplete');
});
