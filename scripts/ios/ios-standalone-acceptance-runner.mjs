import { runIosDatabaseUpgradeAcceptance } from './ios-database-upgrade-acceptance-runner.mjs';
import { runIosDeviceAnchorAcceptance } from './ios-device-anchor-acceptance-runner.mjs';
import { runIosSyncGroupAuthorizationAcceptance } from './ios-sync-group-authorization-acceptance-runner.mjs';
import { runIosSyncGroupLifecycleAcceptance } from './ios-sync-group-lifecycle-acceptance-runner.mjs';

export async function runStandaloneIosAcceptanceScenario(scenario, repoRoot, artifactDir) {
  if (scenario === 'database-upgrade-runtime') {
    await runIosDatabaseUpgradeAcceptance(repoRoot, artifactDir);
    return true;
  }
  if (scenario === 'device-identity') {
    await runIosDeviceAnchorAcceptance(repoRoot, artifactDir);
    return true;
  }
  if (scenario === 'sync-group-authorization') {
    await runIosSyncGroupAuthorizationAcceptance(repoRoot, artifactDir);
    return true;
  }
  if (scenario === 'sync-group-lifecycle') {
    await runIosSyncGroupLifecycleAcceptance(repoRoot, artifactDir);
    return true;
  }
  return false;
}
