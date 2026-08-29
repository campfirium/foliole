import { loadIosAcceptanceContractCorpus } from './ios-acceptance-contract-corpus.ts';
import type { IosContentResourceAcceptanceFixture } from './ios-content-resource-acceptance-service.ts';
import { createIosHostedSyncPackGenerator } from './ios-hosted-sync-pack-generator.ts';
import type { createIosSyncGroupProviderObservations } from './ios-sync-group-provider-observations.ts';
import { createIosSyncGroupScenarioService } from './ios-sync-group-scenario-service.ts';
import { createIosSyncPackAcceptanceRoutes } from './ios-sync-pack-acceptance-routes.ts';

type Observations = ReturnType<typeof createIosSyncGroupProviderObservations>;

export function createIosHostedLiveScenario(args: {
  artifactRoot: string;
  observations: Observations;
  providerDeviceId: string;
  scenario: string;
}) {
  const generator = createIosHostedSyncPackGenerator({
    artifactRoot: args.artifactRoot,
    providerDeviceId: args.providerDeviceId,
    scenario: args.scenario
  });
  let identity: string | null = null;
  let preparation: Promise<PreparedScenario> | null = null;
  return {
    prepare(acceptedIdentity: string | null, collectedCount: number) {
      if (!acceptedIdentity) return Promise.reject(new Error('ios_hosted_accepted_identity_missing'));
      if (collectedCount !== 1) return Promise.reject(new Error('ios_hosted_acceptance_not_collected_once'));
      if (identity && identity !== acceptedIdentity) {
        return Promise.reject(new Error('ios_hosted_second_accepted_identity'));
      }
      identity = acceptedIdentity;
      preparation ??= generator.prepare(acceptedIdentity).then((packs) => prepareServices(args, packs));
      return preparation;
    }
  };
}

interface PreparedScenario {
  contentResourceFixture: IosContentResourceAcceptanceFixture | null;
  scenarioService: Awaited<ReturnType<typeof createIosSyncGroupScenarioService>> | null;
  syncPackService: Awaited<ReturnType<typeof createIosSyncPackAcceptanceRoutes>> | null;
}

async function prepareServices(
  args: { artifactRoot: string; observations: Observations; scenario: string },
  packs: Awaited<ReturnType<ReturnType<typeof createIosHostedSyncPackGenerator>['prepare']>>
): Promise<PreparedScenario> {
  if (args.scenario === 'content-resource-read') {
    return {
      contentResourceFixture: loadIosAcceptanceContractCorpus().contentResourceForPack(packs.contentResource),
      scenarioService: null,
      syncPackService: null
    };
  }
  if (args.scenario === 'sync-pack-runtime') {
    return {
      contentResourceFixture: null,
      scenarioService: null,
      syncPackService: await createIosSyncPackAcceptanceRoutes({
        observations: args.observations.sync_pack,
        packPaths: packs
      })
    };
  }
  return {
    contentResourceFixture: null,
    scenarioService: await createIosSyncGroupScenarioService({
      artifactDir: args.artifactRoot,
      observations: args.observations,
      packPaths: { initial: packs.stateInitial, steady: packs.stateSteady },
      scenario: args.scenario
    }),
    syncPackService: null
  };
}
