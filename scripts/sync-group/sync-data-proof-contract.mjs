export const SYNC_DATA_PROOF_OWNER = 'O-sync-data-scenario';

function failure(message) {
  throw Object.assign(new Error(`Sync data proof: ${message}`), {
    failureAxis: 'data', failureOwner: SYNC_DATA_PROOF_OWNER
  });
}

function exactId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9.-]{1,96}$/u.test(value);
}

function assertInput(input, kind) {
  if (input?.kind !== kind || !exactId(input?.baselineId)) {
    failure(`expected exact ${kind} input`);
  }
}

function assertAction(action, name) {
  if (action?.name !== name || action?.surface !== 'public'
      || !exactId(action?.actionId) || !exactId(action?.runId)) {
    failure(`expected exact public ${name} action`);
  }
}

function assertMutation(mutation, runId) {
  if (!exactId(mutation?.factId) || !['A', 'B', 'C'].includes(mutation?.origin)
      || mutation?.runId !== runId) {
    failure('mutation does not belong to the exact action run');
  }
}

function hasFact(observation, mutation) {
  return observation?.facts?.[mutation.factId] === mutation.origin;
}

function assertFacts(observations, mutations, phase) {
  if (!Array.isArray(observations) || observations.length === 0
      || observations.some((item) => mutations.some((mutation) => !hasFact(item, mutation)))) {
    failure(`exact facts are incomplete at ${phase}`);
  }
}

export function assertExactNoOp({ action, afterDigest, beforeDigest }) {
  if (!exactId(action?.actionId) || !exactId(action?.runId)
      || action?.surface !== 'public' || action?.terminal !== 'no-op'
      || !exactId(beforeDigest) || afterDigest !== beforeDigest) {
    failure('no-op changed data or lacks an exact public action run');
  }
  return { outcome: 'no-op', runId: action.runId };
}

export function assertFreshJoinDataProof({ action, input, mutation, received, restarted }) {
  assertInput(input, 'fresh-unpaired');
  assertAction(action, 'sync-now');
  assertMutation(mutation, action.runId);
  assertFacts([received], [mutation], 'success');
  assertFacts([restarted], [mutation], 'restart');
  return { outcome: 'success', restart: 'preserved', runId: action.runId };
}

export function assertExistingMemberAdmissionDataProof({
  action, input, mutation, received, restarted
}) {
  assertInput(input, 'existing-member-admission');
  assertAction(action, 'sync-now');
  assertMutation(mutation, action.runId);
  assertFacts(received, [mutation], 'success');
  assertFacts(restarted, [mutation], 'restart');
  return { outcome: 'success', restart: 'preserved', runId: action.runId };
}

export function assertLeaveDataProof({ action, departed, input, mutation, restarted, survivors }) {
  assertInput(input, 'joined-member');
  assertAction(action, 'leave');
  assertMutation(mutation, action.runId);
  if (hasFact(departed, mutation)) failure('departed member accepted the post-leave fact');
  assertFacts(survivors, [mutation], 'survivor success');
  assertFacts(restarted, [mutation], 'restart');
  return { departed: 'correct-failure', outcome: 'success', restart: 'preserved' };
}

export function assertRejoinDataProof({ action, input, mutations, received, restarted }) {
  assertInput(input, 'departed-member');
  assertAction(action, 'rejoin');
  if (!Array.isArray(mutations) || mutations.length !== 2
      || mutations[0]?.origin === mutations[1]?.origin) {
    failure('rejoin requires two directional exact mutations');
  }
  mutations.forEach((mutation) => assertMutation(mutation, action.runId));
  assertFacts(received, mutations, 'success');
  assertFacts(restarted, mutations, 'restart');
  return { outcome: 'success', restart: 'preserved', runId: action.runId };
}

export function assertPauseDataProof({
  action, input, pausedMutation, paused, resumedMutation, resumed, restarted
}) {
  assertInput(input, 'active-member');
  assertAction(action, 'pause-resume');
  assertMutation(pausedMutation, action.runId);
  assertMutation(resumedMutation, action.runId);
  if (hasFact(paused, pausedMutation)) failure('paused member accepted the paused fact');
  assertFacts([resumed], [resumedMutation], 'resume success');
  assertFacts([restarted], [resumedMutation], 'restart');
  return { paused: 'correct-failure', resumed: 'success', restart: 'preserved' };
}

export function assertT121ContinuityDataProof({ action, input, mutations, phases, restarted }) {
  assertInput(input, 't121-continuity');
  assertAction(action, 'continuity');
  const requiredPhases = ['offline', 'rejoin', 'cursor-zero', 'continuity'];
  if (!Array.isArray(mutations) || mutations.length !== requiredPhases.length
      || new Set(mutations.map(({ factId }) => factId)).size !== mutations.length
      || new Set(mutations.map(({ phase }) => phase)).size !== requiredPhases.length
      || requiredPhases.some((phase) => !mutations.some((item) => item.phase === phase))) {
    failure('continuity requires offline, rejoin, cursor-zero and continuity mutations');
  }
  mutations.forEach((mutation) => assertMutation(mutation, action.runId));
  for (const phase of requiredPhases) {
    assertFacts(phases?.[phase], mutations.filter((item) => item.phase === phase), phase);
  }
  assertFacts(restarted, mutations, 'restart');
  return { outcome: 'success', restart: 'preserved', runId: action.runId };
}
