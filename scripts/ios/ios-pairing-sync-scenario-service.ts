import path from 'node:path';

import { createIosForegroundSyncLifecycleService } from './ios-foreground-sync-lifecycle-service.ts';
import { createIosStateWritebackAcceptanceService } from './ios-state-writeback-acceptance-service.ts';

export async function createIosPairingSyncScenarioService(args: {
  artifactDir: string;
  observations: {
    foreground_sync_lifecycle: Parameters<typeof createIosForegroundSyncLifecycleService>[0]['observations'];
    state_writeback: Parameters<typeof createIosStateWritebackAcceptanceService>[0]['observations'];
  };
  scenario: string;
  toPeerId: string;
}) {
  const service = await createIosStateWritebackAcceptanceService({
    observations: args.observations.state_writeback,
    outputDirectory: path.join(args.artifactDir, 'state-writeback-desktop'),
    toPeerId: args.toPeerId
  });
  return {
    close: service.close,
    route: args.scenario === 'foreground-sync-lifecycle'
      ? createIosForegroundSyncLifecycleService({
        artifactDir: args.artifactDir,
        observations: args.observations.foreground_sync_lifecycle,
        route: service.route
      })
      : service.route
  };
}
