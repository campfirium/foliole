// @vitest-environment node
import path from 'node:path';
import process from 'node:process';

import { it } from 'vitest';

await import('./simulatorHostBoundary.mjs');
const { runIdentityDeleteRestore, runIdentityDivergence,
  runIdentityLostReply, runIdentityMissingFact,
  runIdentityRelay } = await import('./identityRun.js');
const { runScenario } = await import('./run.js');
const { runIdentityReorderedParents } = await import('./reorderedParents.js');
const { runIdentityReorderSchedules } = await import('./reorderedParentSchedules.js');
const { runIdentityOrderIntent } = await import('./orderIntentScenarios.js');
const { runIdentityRetainedOfflineFork } = await import('./nodeRetentionScenarios.js');
const { runIdentityIncomparableProjection } = await import('./nodeProjectionScenario.js');
const { runIdentityNestedOrder } = await import('./nestedOrder.js');
const { runIdentityMissingReview } = await import('./reviewFact.js');
const { runIdentityMissingResource } = await import('./resourceFact.js');
const { runCompanionIdentityResourceContinuation } = await import('./companionIdentityScenarios.js');
const output = process.env.FOLIOLE_SIM_OUTPUT ?? path.resolve('.tmp/artifacts/sync-identity-simulator', `test-${Date.now()}`);
it('companion resources-only continuation preserves unexchanged structure and persists repaired bytes', async () => {
  await runCompanionIdentityResourceContinuation(path.join(output, 'companion-resource-continuation'));
}, 600_000);
it('global ID path converges an empty receiving library', async () => {
  await runScenario('continuous', path.join(output, 'continuous'));
}, 600_000);
it('global ID path carries mixed node kinds and root dependencies', async () => {
  await runScenario('kinds', path.join(output, 'kinds'));
}, 600_000);
it('global ID path converges concurrent additions in a nested parent', async () => {
  await runIdentityNestedOrder(path.join(output, 'nested-order'));
}, 600_000);
it('global ID path propagates a node tombstone after its original pack', async () => {
  await runScenario('deletion', path.join(output, 'deletion'));
}, 600_000);
it('global ID path resumes an interrupted attachment transfer', async () => {
  await runScenario('resources', path.join(output, 'resources'));
}, 600_000);
it('global ID path replays a committed push after its HTTP reply is lost', async () => {
  await runIdentityLostReply(path.join(output, 'lost-reply'));
}, 600_000);
it('global ID path restores a retained parent edge behind an equal object head', async () => {
  await runIdentityMissingFact(path.join(output, 'missing-fact'));
}, 600_000);
it('global ID path restores a review operation behind an equal object head', async () => {
  await runIdentityMissingReview(path.join(output, 'missing-review'));
}, 600_000);
it('global ID path restores attachment bytes behind an equal object head', async () => {
  await runIdentityMissingResource(path.join(output, 'missing-resource'));
}, 600_000);
it('global ID path converges two edits of the same node ID', async () => {
  await runIdentityDivergence(path.join(output, 'divergence'));
}, 600_000);
it('global ID path restores a node after its tombstone', async () => {
  await runIdentityDeleteRestore(path.join(output, 'delete-restore'));
}, 600_000);
it('global ID relay survives an offline origin and restarts', async () => {
  await runIdentityRelay(path.join(output, 'relay'));
}, 600_000);

it('global ID path retains and restores three concurrent root and nested reorders', async () => {
  await runIdentityReorderedParents(path.join(output, 'reordered-parents'));
}, 600_000);

it('global ID reorders converge across independent pairings and restore durable losers after membership changes and collection', async () => {
  await runIdentityReorderSchedules(path.join(output, 'reorder-schedules'));
}, 600_000);

it('global ID repairs a required base and preserves an indirectly relayed offline fork after independent merges and collection', async () => {
  await runIdentityRetainedOfflineFork(path.join(output, 'retained-offline-fork'));
}, 600_000);

it('global ID converges independently projected heads with incomparable bases after collection and restart', async () => {
  await runIdentityIncomparableProjection(path.join(output, 'incomparable-projection'));
}, 600_000);

it('global ID preserves independently identical user reorders after exchange and restart for root and nested parents', async () => {
  await runIdentityOrderIntent(path.join(output, 'same-reorder'), 'same-reorder');
}, 600_000);

it('global ID places an added child immediately after its original preceding anchor when anchors reverse', async () => {
  await runIdentityOrderIntent(path.join(output, 'reversed-anchors'), 'reversed-anchors');
}, 600_000);
