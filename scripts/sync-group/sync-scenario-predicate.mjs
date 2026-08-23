function fail(message) {
  throw new Error(`Sync scenario predicate: ${message}`);
}

function exactFact(observation, mutation) {
  return observation?.facts?.[mutation.factId] === mutation.origin;
}

function assertMutation(mutation) {
  if (!/^[A-Za-z0-9.-]{1,96}$/u.test(mutation?.runId ?? '')
      || typeof mutation?.factId !== 'string' || mutation.factId === ''
      || !['A', 'B', 'C'].includes(mutation?.origin)) {
    fail('exact mutation identity is incomplete');
  }
  return mutation;
}

export function factObservation(journeyFacts) {
  return { facts: { ...(journeyFacts ?? {}) } };
}

export function assertFreshJoinInitialConvergence({ mutation, received, restarted }) {
  assertMutation(mutation);
  if (!exactFact(received, mutation)) fail('fresh join did not receive the exact initial fact');
  if (!exactFact(restarted, mutation)) fail('fresh join did not preserve the exact fact after restart');
  return { factId: mutation.factId, origin: mutation.origin, restarted: true,
    runId: mutation.runId };
}

export function assertBidirectionalConvergence({ mutations, observations }) {
  if (!Array.isArray(mutations) || mutations.length !== 2
      || mutations[0]?.origin === mutations[1]?.origin) {
    fail('bidirectional mutations must identify two distinct origins');
  }
  return assertExactFactConvergence({ mutations, observations });
}

export function assertExactFactConvergence({ mutations, observations }) {
  if (!Array.isArray(mutations) || mutations.length === 0) {
    fail('exact mutations are missing');
  }
  mutations.forEach(assertMutation);
  if (new Set(mutations.map(({ factId }) => factId)).size !== mutations.length
      || new Set(mutations.map(({ runId }) => runId)).size !== 1) {
    fail('exact mutations do not belong to one run');
  }
  for (const phase of ['received', 'restarted']) {
    const hosts = observations?.[phase];
    if (!Array.isArray(hosts) || hosts.length === 0
        || hosts.some((host) => mutations.some((mutation) => !exactFact(host, mutation)))) {
      fail(`exact facts are incomplete at ${phase}`);
    }
  }
  return { factIds: mutations.map(({ factId }) => factId), restarted: true,
    runId: mutations[0].runId };
}

export function assertPauseResumeContinuity({ mutation, paused, resumed, restarted }) {
  assertMutation(mutation);
  if (exactFact(paused, mutation)) fail('paused participant accepted the exact offline fact');
  if (!exactFact(resumed, mutation)) fail('resumed participant did not receive the exact fact');
  if (!exactFact(restarted, mutation)) fail('resumed continuity did not survive restart');
  return { factId: mutation.factId, refusedWhilePaused: true, restarted: true,
    runId: mutation.runId };
}

export function assertLeaveContinuity({ mutation, departed, survivors }) {
  assertMutation(mutation);
  if (exactFact(departed, mutation)) fail('departed participant accepted the exact survivor fact');
  if (!Array.isArray(survivors) || survivors.length === 0
      || survivors.some((host) => !exactFact(host, mutation))) {
    fail('survivors did not converge on the exact post-leave fact');
  }
  return { factId: mutation.factId, refusedByDeparted: true, runId: mutation.runId };
}

export function assertExactDatasetConvergence({ mutation, observations }) {
  if (!/^[A-Za-z0-9.-]{1,96}$/u.test(mutation?.runId ?? '')
      || typeof mutation?.datasetDigest !== 'string' || mutation.datasetDigest === '') {
    fail('exact dataset mutation identity is incomplete');
  }
  if (!Array.isArray(observations) || observations.length < 2
      || observations.some((observation) =>
        observation?.datasetDigest !== mutation.datasetDigest)) {
    fail('hosts did not converge on the exact dataset mutation');
  }
  return { datasetDigest: mutation.datasetDigest, runId: mutation.runId };
}
