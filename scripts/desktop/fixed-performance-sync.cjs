const { performance } = require('node:perf_hooks');
const { prepareRequestFixture } = require('./fixed-performance-request-fixture.cjs');

async function measure(fixture, count) {
  const changes = () => fixture.db.prepare('SELECT total_changes() AS count').get().count;
  const before = changes();
  const started = performance.now();
  await fixture.apply();
  const durationMs = performance.now() - started;
  fixture.assertResult();
  return { durationMs, sqliteChangedRows: changes() - before, nodeCount: count };
}

async function runFixedSyncBenchmark({ nodeCount, repeats }, services) {
  const first = [];
  const unchanged = [];
  for (let sample = 0; sample < repeats; sample++) {
    const fixture = await prepareRequestFixture(nodeCount, services);
    try {
      first.push(await measure(fixture, nodeCount));
      unchanged.push(await measure(fixture, nodeCount));
    } finally { await fixture.close(); }
  }
  return { boundary: 'production request batch receive; in-memory SQLite; excludes HTTP and resources', first, unchanged };
}

module.exports = { runFixedSyncBenchmark };
