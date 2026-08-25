import { runIosDatabaseUpgradeAcceptance } from './ios-database-upgrade-acceptance-runner.mjs';
import { runIosSyncGroupMigrationAcceptance } from './ios-sync-group-migration-acceptance-runner.mjs';
import { runIosSyncGroupAuthorizationAcceptance } from './ios-sync-group-authorization-acceptance-runner.mjs';

export async function runStandaloneIosAcceptanceScenario(scenario, repoRoot, artifactDir) {
  if (scenario === 'database-upgrade-runtime') {
    await runIosDatabaseUpgradeAcceptance(repoRoot, artifactDir);
    return true;
  }
  if (scenario === 'sync-group-migration') {
    await runIosSyncGroupMigrationAcceptance(repoRoot, artifactDir);
    return true;
  }
  if (scenario === 'sync-group-authorization') {
    await runIosSyncGroupAuthorizationAcceptance(repoRoot, artifactDir);
    return true;
  }
  return false;
}
