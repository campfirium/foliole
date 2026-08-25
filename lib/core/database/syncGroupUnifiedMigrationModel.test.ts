import { describe, expect, it } from 'vitest';

import { COMPANION_DATABASE_VERSION } from '../../platform/nativeCompanionContract.js';
import {
  EMPTY_UNIFIED_INSTALLATION_REGISTRY,
  UNIFIED_COMPANION_SCHEMA_VERSION,
  UNIFIED_DESKTOP_SCHEMA_VERSION
} from '../../platform/syncGroupUnifiedContract.js';

import { DATABASE_SCHEMA_VERSION } from './databaseSchemaVersion.js';
import { createUnifiedMigrationLegacyFixture } from './syncGroupUnifiedMigrationFixture.js';
import { createUnifiedMigrationDecision } from './syncGroupUnifiedMigrationModel.js';
import { UNREGISTERED_UNIFIED_SCHEMA_MIGRATIONS } from './syncGroupUnifiedMigrationRegistration.js';

describe('inactive unified Sync Group migration model', () => {
  it('selects one installation binding across every registered library', () => {
    const fixture = createUnifiedMigrationLegacyFixture(DATABASE_SCHEMA_VERSION);
    const decision = createUnifiedMigrationDecision({
      credentials: fixture.credentials,
      current_library_id: fixture.current_library_id,
      installation_id: fixture.installation_id,
      libraries: fixture.libraries,
      registry: EMPTY_UNIFIED_INSTALLATION_REGISTRY
    });

    expect(decision.active_binding).toEqual({
      group_id: 'group-a',
      installation_id: fixture.installation_id,
      library_id: 'library-a',
      local_member_id: 'legacy-member:authorization-local-a',
      state: 'active',
      timeline_id: 'timeline-a'
    });
    expect(decision.libraries.map(({ binding_state, library_id }) => ({ binding_state, library_id })))
      .toEqual([
        { binding_state: 'active', library_id: 'library-a' },
        { binding_state: 'departed', library_id: 'library-b' }
      ]);
  });

  it('keeps V and V 2 as separate legacy identities and exposes credential conflict', () => {
    const fixture = createUnifiedMigrationLegacyFixture(DATABASE_SCHEMA_VERSION);
    const decision = createUnifiedMigrationDecision({
      credentials: fixture.credentials,
      current_library_id: fixture.current_library_id,
      installation_id: fixture.installation_id,
      libraries: fixture.libraries,
      registry: EMPTY_UNIFIED_INSTALLATION_REGISTRY
    });
    const firstLibrary = decision.libraries[0];
    if (!firstLibrary) throw new Error('unified migration first library decision missing');
    const remote = firstLibrary.members.filter((member) => member.display_name === 'V');

    expect(remote.map((member) => member.member_id)).toEqual([
      'legacy-member:authorization-v',
      'legacy-member:authorization-v2'
    ]);
    expect(remote.every((member) => member.installation_id === null &&
      member.identity_state === 'legacy_identity_unverified')).toBe(true);
    const secondRemote = remote[1];
    if (!secondRemote) throw new Error('unified migration V 2 decision missing');
    expect(secondRemote.repair_reasons).toEqual([
      'identity_repair_required',
      'route_reauthorization_required',
      'credential_conflict'
    ]);
  });
});

describe('inactive unified Sync Group migration registration', () => {
  it('leaves the future schema seam inactive while production stays v77/v32', () => {
    expect({ companion: COMPANION_DATABASE_VERSION, desktop: DATABASE_SCHEMA_VERSION }).toEqual({
      companion: 32,
      desktop: 77
    });
    expect(UNREGISTERED_UNIFIED_SCHEMA_MIGRATIONS).toEqual({
      companion: { from_version: 32, registered: false, target_version: UNIFIED_COMPANION_SCHEMA_VERSION },
      desktop: { from_version: 77, registered: false, target_version: UNIFIED_DESKTOP_SCHEMA_VERSION }
    });
  });
});
