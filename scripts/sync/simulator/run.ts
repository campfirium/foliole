import { promises as fs } from 'node:fs';
import path from 'node:path';

import { assertHealthy, defects, stateSummary, assertResources, addedDefects } from './assertions.js';
import { snapshotInput, copyInputResources } from './input.js';
import { escapedDependencyPage, largeDependencyPage } from './largeDependencyPage.js';
import { assertLocalRootsPreserved, localRootRecords } from './localRootRecords.js';
import { moveBetweenFolders, sourceEditDuringSync, unchangedReplay } from './mutationScenarios.js';
import { openStateBatch } from './openStateBatch.js';
import { operations, resetOperations } from './operations.js';
import { localRootState, orphanedLearningState, tombstonedLearningState, unbackedLearningState } from './orphanedLearningState.js';
import { openPeer, pairPeers } from './peers.js';
import { lostPushResponse, walSnapshot } from './recovery.js';
import { resourceRecovery } from './resourceRecovery.js';
import { mismatchedResourceType, resources } from './resources.js';
import { scenarios, converge } from './scenarios.js';
import type { SimulatorPeer } from './scope.js';
import { serve, type Endpoint } from './transport.js';

const extraScenarios = { resources, 'lost-push-response': lostPushResponse, 'wal-snapshot': walSnapshot,
  'open-state-batch': openStateBatch, 'resource-recovery': resourceRecovery,
  'orphaned-learning-state': orphanedLearningState, 'large-dependency-page': largeDependencyPage,
  'unbacked-learning-state': unbackedLearningState, 'escaped-dependency-page': escapedDependencyPage,
  'tombstoned-learning-state': tombstonedLearningState, 'mismatched-resource-type': mismatchedResourceType,
  'local-root-state': localRootState, 'source-edit-during-sync': sourceEditDuringSync,
  'move-between-folders': moveBetweenFolders, 'unchanged-replay': unchangedReplay };
export const scenarioNames = [...Object.keys(scenarios), ...Object.keys(extraScenarios)];
export async function runScenario(label: string, root: string) {
  const companion = label.endsWith('-companion');
  const name = companion ? label.slice(0, -10) : label;
  process.env.FOLIOLE_SIM_PATH = companion ? 'companion' : 'desktop';
  process.env.FOLIOLE_SIM_SCENARIO = name;
  resetOperations();
  await fs.mkdir(root, { recursive: true });
  const peers: SimulatorPeer[] = [];
  const endpoints: Endpoint[] = [];
  let error: unknown;
  let inputs: Awaited<ReturnType<typeof snapshotInput>>[] = [];
  let baseline: ReturnType<typeof defects>[] = [];
  try {
    if (name === 'real') inputs = await prepareInputs(root);
    const seed = process.env.FOLIOLE_SIM_SEED ?? '1';
    const a = openPeer(root, 'a', seed);
    peers.push(a);
    const b = openPeer(root, 'b', seed);
    peers.push(b);
    baseline = peers.map(defects);
    await writeJson(root, 'input.json', { inputs, baseline });
    const existingGaps = name === 'real' ? baseline.flatMap((report) => report.missingParents) : [];
    const missingKeys = inputMissingKeys(inputs);
    if (name === 'real') validateInputs(inputs, peers, existingGaps);
    pairPeers(peers);
    const sa = await serve(a);
    endpoints.push(sa);
    const sb = await serve(b);
    endpoints.push(sb);
    const ctx = { a, b, sa, sb, existingGaps, missingKeys };
    if (name === 'real') {
      const localRootsBefore = peers.map(localRootRecords);
      await writeJson(root, 'local-roots-before.json', localRootsBefore);
      await converge(ctx);
      peers.forEach((peer, index) => assertLocalRootsPreserved(peer, localRootsBefore[index]!));
      await assertResources(a, b, missingKeys);
      await assertResources(b, a, missingKeys);
    } else if (name in extraScenarios) await extraScenarios[name as keyof typeof extraScenarios](ctx);
    else await scenarios[name]!(ctx);
    for (const peer of peers) assertHealthy(peer, existingGaps);
  } catch (caught) { error = caught; }
  finally {
    for (const endpoint of endpoints) await endpoint.close();
    const snapshot = snapshotPeers(peers, baseline);
    error ??= snapshot.error;
    await writeJson(root, 'operations.json', operations);
    await writeJson(root, 'result.json', { scenario: label, receivePath: process.env.FOLIOLE_SIM_PATH, status: error ? 'failed' : 'passed',
      revision: process.env.FOLIOLE_SIM_REVISION, seed: process.env.FOLIOLE_SIM_SEED ?? '1',
      scale: process.env.FOLIOLE_SIM_SCALE ?? '1', error: error ? String(error) : null,
      resourceStatus: inputMissingKeys(inputs).size ? 'partial' : 'complete',
      inputDefects: baseline, final: snapshot.final, requests: endpoints.map((endpoint) => endpoint.requests) });
    for (const peer of peers) peer.sqlite.close();
  }
  if (error) throw error;
}
function snapshotPeers(peers: SimulatorPeer[], baseline: ReturnType<typeof defects>[]) {
  let error: unknown;
  const final = peers.map((peer, index) => {
    try {
      const report = defects(peer);
      const prior = baseline[index] ? { ...baseline[index],
        missingParents: baseline.flatMap((input) => input.missingParents) } : null;
      return { peer: peer.name, defects: report,
        newDefects: prior ? addedDefects(prior, report) : report, state: stateSummary(peer) };
    } catch (caught) {
      error ??= caught;
      return { peer: peer.name, snapshotError: String(caught) };
    }
  });
  return { final, error };
}
function validateInputs(inputs: Awaited<ReturnType<typeof snapshotInput>>[], peers: SimulatorPeer[], existingGaps: unknown[]) {
  const count = inputs.reduce((sum, input) => sum + input.unreadableArticleIds.length, 0);
  if (count) throw new Error(`simulator_input_bodies_unavailable:${count}:see_input.json`);
  for (const peer of peers) assertHealthy(peer, existingGaps);
}
function inputMissingKeys(inputs: Awaited<ReturnType<typeof snapshotInput>>[]) {
  const required = new Set(inputs.flatMap((input) => input.resourceNeeds.map((need) => need.storageKey)));
  return new Set([...required].filter((key) => inputs.every((input) => input.resourceIssues.some((issue) => issue.key === key))));
}
async function prepareInputs(root: string) {
  const database = process.env.FOLIOLE_SIM_DATABASE;
  if (!database) throw new Error('simulator_database_required');
  const inputs = [await snapshotInput(database, process.env.FOLIOLE_SIM_ASSETS, path.join(root, 'a'), true)];
  if (process.env.FOLIOLE_SIM_TARGET_DATABASE) inputs.push(await snapshotInput(
    process.env.FOLIOLE_SIM_TARGET_DATABASE, process.env.FOLIOLE_SIM_TARGET_ASSETS, path.join(root, 'b'), true));
  const needs = [...new Map(inputs.flatMap((input) => input.resourceNeeds.map((need) => [need.storageKey, need] as const))).values()];
  for (const input of inputs) await copyInputResources(input, needs);
  return inputs;
}
async function writeJson(root: string, file: string, value: unknown) {
  await fs.writeFile(path.join(root, file), JSON.stringify(value, (_, item) =>
    typeof item === 'bigint' ? String(item) : item, 2));
}
