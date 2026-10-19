/* global setImmediate, setTimeout */
const fs = require('node:fs');
const { Session } = require('node:inspector/promises');
const { prepareRequestFixture } = require('./fixed-performance-request-fixture.cjs');

async function runSyncPackLoad({ markerPath, nodeCount, blockMs, mode = 'existing', profilePath }, services) {
  const fixture = await prepareRequestFixture(nodeCount, services);
  const profiler = profilePath ? new Session() : null;
  try {
    if (mode === 'existing') {
      await fixture.apply();
      fixture.assertResult();
    }
    const initialNodeCount = fixture.db.prepare('SELECT COUNT(*) AS count FROM nodes').get().count;
    fs.writeFileSync(markerPath, 'ready');
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (profiler) {
      profiler.connect();
      await profiler.post('Profiler.enable');
      await profiler.post('Profiler.start');
    }
    const before = { ...fixture.timings };
    fixture.writes.clear();
    const startedAt = Date.now();
    if (blockMs > 0) {
      const until = Date.now() + blockMs;
      while (Date.now() < until) { /* controlled test-only event-loop block */ }
    }
    let passes = 0;
    do {
      await fixture.apply();
      passes++;
      await new Promise((resolve) => setImmediate(resolve));
    } while (Date.now() - startedAt < 2200);
    const endedAt = Date.now();
    if (profiler) {
      const { profile } = await profiler.post('Profiler.stop');
      fs.writeFileSync(profilePath, JSON.stringify(profile));
    }
    const timings = Object.fromEntries(Object.entries(fixture.timings)
      .map(([key, value]) => [key, value - before[key]]));
    fixture.assertResult();
    const nodeCountAfter = fixture.db.prepare('SELECT COUNT(*) AS count FROM nodes').get().count;
    return { startedAt, endedAt, durationMs: endedAt - startedAt,
      result: { mode, initialNodeCount, passes, nodeCount: nodeCountAfter, timings,
        writes: [...fixture.writes.values()].sort((left, right) => right.ms - left.ms) } };
  } finally {
    profiler?.disconnect();
    await fixture.close();
  }
}

module.exports = { runSyncPackLoad };
