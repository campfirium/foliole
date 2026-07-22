import { runIosDatabaseUpgradeAcceptance } from './ios-database-upgrade-acceptance-runner.mjs';
import { runIosForegroundSyncLifecycleAcceptance } from './ios-foreground-sync-lifecycle-runner.mjs';

export async function runStandaloneIosAcceptanceScenario(scenario, repoRoot, artifactDir) {
  if (scenario === 'database-upgrade-runtime') {
    await runIosDatabaseUpgradeAcceptance(repoRoot, artifactDir);
    return true;
  }
  if (scenario === 'foreground-sync-lifecycle') {
    await runIosForegroundSyncLifecycleAcceptance(repoRoot, artifactDir);
    return true;
  }
  return false;
}
