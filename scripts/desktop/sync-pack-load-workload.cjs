/* global setImmediate, setTimeout */
const fs = require('node:fs');
const { prepareRequestFixture } = require('./fixed-performance-request-fixture.cjs');

async function runSyncPackLoad({ markerPath, nodeCount, blockMs, mode = 'existing' }, services) {
  const fixture = await prepareRequestFixture(nodeCount, services);
  try {
    if (mode === 'existing') {
      await fixture.apply();
      fixture.assertResult();
    }
    const initialNodeCount = fixture.db.prepare('SELECT COUNT(*) AS count FROM nodes').get().count;
    fs.writeFileSync(markerPath, 'ready');
    await new Promise((resolve) => setTimeout(resolve, 250));
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
    fixture.assertResult();
    const nodeCountAfter = fixture.db.prepare('SELECT COUNT(*) AS count FROM nodes').get().count;
    return { startedAt, endedAt, durationMs: endedAt - startedAt,
      result: { mode, initialNodeCount, passes, nodeCount: nodeCountAfter } };
  } finally {
    await fixture.close();
  }
}

module.exports = { runSyncPackLoad };
