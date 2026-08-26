import { runIosDatabaseUpgradeAcceptance } from './ios-database-upgrade-acceptance-runner.mjs';
import { runIosDeviceAnchorAcceptance } from './ios-device-anchor-acceptance-runner.mjs';

export async function runStandaloneIosAcceptanceScenario(scenario, repoRoot, artifactDir) {
  if (scenario === 'database-upgrade-runtime') {
    await runIosDatabaseUpgradeAcceptance(repoRoot, artifactDir);
    return true;
  }
  if (scenario === 'device-identity') {
    await runIosDeviceAnchorAcceptance(repoRoot, artifactDir);
    return true;
  }
  return false;
}
