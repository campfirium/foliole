import { readFileSync } from 'node:fs';
import path from 'node:path';

import { verifyContentResourceAcceptance } from './ios-content-resource-acceptance-runner.mjs';
import { verifySyncGroupTransportAcceptance } from './ios-sync-group-provider-runner.mjs';
import { verifyStateWritebackAcceptance } from './ios-state-writeback-acceptance-runner.mjs';
import { verifySyncGroupDiscoveryAcceptance } from './ios-sync-group-discovery-acceptance-runner.mjs';
import { verifySyncGroupJoinAcceptance } from './ios-sync-group-join-acceptance-runner.mjs';
import { verifySyncPackAcceptance } from './ios-sync-pack-acceptance-runner.mjs';
import { verifySyncTriggerAcceptance } from './ios-sync-trigger-acceptance-runner.mjs';

export function verifyAcceptanceScenario(args) {
  if (args.scenario === 'sync-group-discovery-events') {
    return { sync_group_discovery: verifySyncGroupDiscoveryAcceptance(args.firstBridge, args.secondBridge) };
  }
  if (args.scenario === 'sync-trigger-runtime') {
    return { sync_trigger: verifySyncTriggerAcceptance(args.firstBridge, args.secondBridge) };
  }
  if (args.scenario === 'sync-group-join-runtime') {
    return { sync_group_join: verifySyncGroupJoinAcceptance(args.firstBridge, args.secondBridge) };
  }
  if (args.scenario === 'content-resource-read') {
    return { content_resource: verifyContentResourceAcceptance(
      args.firstBridge, args.secondBridge, args.firstContentObservations, args.secondContentObservations
    ) };
  }
  if (args.scenario === 'sync-pack-runtime') {
    return { sync_pack: verifySyncPackAcceptance(
      args.firstBridge, args.secondBridge, args.firstScenarioSnapshot, args.secondScenarioSnapshot,
      args.syncPackRejections, args.providerObservations
    ) };
  }
  if (args.scenario === 'state-writeback-runtime') {
    return { state_writeback: verifyStateWritebackAcceptance(
      args.firstBridge, args.secondBridge, args.firstScenarioSnapshot, args.secondScenarioSnapshot,
      args.providerObservations
    ) };
  }
  return { sync_group_transport: verifySyncGroupTransportAcceptance(
    args.firstBridge, args.secondBridge, args.providerObservations
  ) };
}

export function readServiceObservations(artifactDir) {
  return JSON.parse(readFileSync(path.join(artifactDir, 'service-observations.json'), 'utf8'));
}
