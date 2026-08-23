import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const RELATIVE_ROOT = path.join('scripts', 'ios', 'fixtures', 'database-upgrade-runtime');

export function resolveIosDatabaseUpgradeContractFixture(repoRoot) {
  const root = path.join(repoRoot, RELATIVE_ROOT);
  const identity = JSON.parse(readFileSync(path.join(root, 'fixture.json'), 'utf8'));
  if (identity.version !== 1 || identity.database_user_version !== 4) {
    throw new Error('ios_database_upgrade_contract_fixture_identity_invalid');
  }
  const databasePath = path.join(root, identity.file);
  const actualHash = createHash('sha256').update(readFileSync(databasePath)).digest('hex');
  if (actualHash !== identity.sha256) {
    throw new Error('ios_database_upgrade_contract_fixture_hash_mismatch');
  }
  return { databasePath, identity };
}
