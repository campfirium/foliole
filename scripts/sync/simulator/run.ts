import { promises as fs } from 'node:fs';
import path from 'node:path';

import { assertHealthy, defects, stateSummary, assertResources, addedDefects } from './assertions.js';
import { snapshotInput } from './input.js';
import { operations, resetOperations } from './operations.js';
import { openPeer, pairPeers } from './peers.js';
import { lostPushResponse, walSnapshot } from './recovery.js';
import { resources } from './resources.js';
import { scenarios, converge } from './scenarios.js';
import type { SimulatorPeer } from './scope.js';
import { serve, type Endpoint } from './transport.js';

const extraScenarios = { resources, 'lost-push-response': lostPushResponse, 'wal-snapshot': walSnapshot };
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
  let inputs: unknown[] = [];
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
    if (name === 'real') validateInputs(inputs as { resourceIssues: unknown[] }[], peers);
    pairPeers(peers);
    const sa = await serve(a);
    endpoints.push(sa);
    const sb = await serve(b);
    endpoints.push(sb);
    const ctx = { a, b, sa, sb };
    if (name === 'real') {
      await converge(ctx);
      await assertResources(a, b);
    } else if (name in extraScenarios) await extraScenarios[name as keyof typeof extraScenarios](ctx);
    else await scenarios[name]!(ctx);
    for (const peer of peers) assertHealthy(peer);
  } catch (caught) { error = caught; }
  finally {
    for (const endpoint of endpoints) await endpoint.close();
    const final = peers.map((peer, index) => {
      try {
        const report = defects(peer);
        return { peer: peer.name, defects: report,
          newDefects: baseline[index] ? addedDefects(baseline[index], report) : report, state: stateSummary(peer) };
      }
      catch (snapshotError) {
        error ??= snapshotError;
        return { peer: peer.name, snapshotError: String(snapshotError) };
      }
    });
    await writeJson(root, 'operations.json', operations);
    await writeJson(root, 'result.json', { scenario: label, receivePath: process.env.FOLIOLE_SIM_PATH, status: error ? 'failed' : 'passed',
      revision: process.env.FOLIOLE_SIM_REVISION, seed: process.env.FOLIOLE_SIM_SEED ?? '1',
      scale: process.env.FOLIOLE_SIM_SCALE ?? '1', error: error ? String(error) : null,
      inputDefects: baseline, final, requests: endpoints.map((endpoint) => endpoint.requests) });
    for (const peer of peers) peer.sqlite.close();
  }
  if (error) throw error;
}
function validateInputs(inputs: { resourceIssues: unknown[] }[], peers: SimulatorPeer[]) {
  const count = inputs.reduce((sum, input) => sum + input.resourceIssues.length, 0);
  if (count) throw new Error(`simulator_input_resources_invalid:${count}:see_input.json`);
  for (const peer of peers) assertHealthy(peer);
}
async function prepareInputs(root: string) {
  const database = process.env.FOLIOLE_SIM_DATABASE;
  if (!database) throw new Error('simulator_database_required');
  const inputs = [await snapshotInput(database, process.env.FOLIOLE_SIM_ASSETS, path.join(root, 'a'))];
  if (process.env.FOLIOLE_SIM_TARGET_DATABASE) inputs.push(await snapshotInput(
    process.env.FOLIOLE_SIM_TARGET_DATABASE, process.env.FOLIOLE_SIM_TARGET_ASSETS, path.join(root, 'b')));
  return inputs;
}
async function writeJson(root: string, file: string, value: unknown) {
  await fs.writeFile(path.join(root, file), JSON.stringify(value, (_, item) =>
    typeof item === 'bigint' ? String(item) : item, 2));
}
