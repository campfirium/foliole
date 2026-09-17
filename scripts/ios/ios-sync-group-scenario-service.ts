import { createIosForegroundSyncLifecycleService } from './ios-foreground-sync-lifecycle-service.ts';
import { createIosStateWritebackAcceptanceService } from './ios-state-writeback-acceptance-service.ts';
import { routeIosHostedMemberStateRequest } from './ios-sync-group-member-state-service.ts';

type ScenarioRoute = Awaited<ReturnType<typeof createIosStateWritebackAcceptanceService>>['route'];

export async function createIosSyncGroupScenarioService(args: {
  artifactDir: string;
  observations: {
    foreground_sync_lifecycle: Parameters<typeof createIosForegroundSyncLifecycleService>[0]['observations'];
    state_writeback: Parameters<typeof createIosStateWritebackAcceptanceService>[0]['observations'];
  };
  packPaths: { initial: string; steady: string };
  scenario: string;
}) {
  const service = await createIosStateWritebackAcceptanceService({
    observations: args.observations.state_writeback,
    outputDirectory: args.artifactDir,
    packPaths: args.packPaths
  });
  return {
    close: service.close,
    route: withMemberStateRoute(args.scenario === 'foreground-sync-lifecycle'
      ? createIosForegroundSyncLifecycleService({
        artifactDir: args.artifactDir,
        observations: args.observations.foreground_sync_lifecycle,
        route: service.route
      })
      : service.route)
  };
}

function withMemberStateRoute(route: ScenarioRoute): ScenarioRoute {
  return async (request: { bodyText: string; method: string; url: string }) =>
    routeIosHostedMemberStateRequest(request) ?? route(request);
}
