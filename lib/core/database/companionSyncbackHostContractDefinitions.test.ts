import { expect, it } from 'vitest';

import { COMPANION_SYNCBACK_HOST_CONTRACT } from './companionSyncbackHostContractDefinitions.js';

it('retries current dirty state until the target peer confirms delivery', () => {
  expect(COMPANION_SYNCBACK_HOST_CONTRACT.sql.state).toContain('AND ? >= 0');
  expect(COMPANION_SYNCBACK_HOST_CONTRACT.sql.state).not.toContain('AND state_seq > ?');
  expect(COMPANION_SYNCBACK_HOST_CONTRACT.sql.state).toContain(
    "receipt.status IN ('accepted', 'confirmed')"
  );
  expect(COMPANION_SYNCBACK_HOST_CONTRACT.sql.state).toContain(
    "sync_object_state.object_type = 'node_text_alternative'"
  );
  expect(COMPANION_SYNCBACK_HOST_CONTRACT.sql.state).toContain(
    'sync_object_state.deleted_at IS NOT NULL'
  );
});
