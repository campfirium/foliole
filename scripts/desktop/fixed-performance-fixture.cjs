/* global process */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function seedFixture(db, services, nodes) {
  const driver = services.createDriver(db);
  driver.transaction(() => {
    for (const [index, node] of nodes.entries()) {
      const at = new Date(Date.UTC(2026, 9, 1, 0, 0, index)).toISOString();
      services.upsert(driver, { nodeId: node.id, kind: 'topic', title: node.title,
        content: node.content, parentNodeId: null, isTitleManual: true, hideTitleHeading: false,
        reveal: null, anchorLink: null, position: index, createdAt: at, updatedAt: at,
        hostName: 'benchmark-fixture' });
      assert.ok(services.flushVersion(driver, node.id, 'benchmark-fixture', at));
    }
    services.replaceOrder(driver, nodes.map((node) => node.id));
  });
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM nodes WHERE id LIKE 'benchmark-%'").get().count, nodes.length);
}

function assertInside(root, file) {
  const relative = path.relative(fs.realpathSync(root), fs.realpathSync(file));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Fixture path outside isolated state');
}

function main() {
  const [root, databasePath, searchPath, inputPath] = process.argv.slice(2);
  assert.equal(process.argv.slice(2).length, 4);
  const relativeRoot = path.relative(fs.realpathSync('.tmp/artifacts'), fs.realpathSync(root));
  if (!relativeRoot || relativeRoot.startsWith('..') || path.isAbsolute(relativeRoot)) throw new Error('Fixture root must be within artifacts');
  for (const file of [databasePath, searchPath, inputPath]) assertInside(root, file);
  const built = (name) => require(path.resolve('dist', name));
  const Database = require('better-sqlite3');
  const db = new Database(databasePath);
  try {
    db.prepare('ATTACH DATABASE ? AS search').run(searchPath);
    seedFixture(db, {
      createDriver: built('electron/database/betterSqlite3Driver.js').createBetterSqlite3Driver,
      upsert: built('lib/core/database/nodeMutations.js').upsertNodeSnapshot,
      replaceOrder: built('lib/core/database/nodeOrderMutations.js').replaceNodeOrder,
      flushVersion: built('electron/database/nodeSyncVersionFromDriver.js').flushNodeSyncVersionWithDriver
    }, JSON.parse(fs.readFileSync(inputPath, 'utf8')));
  } finally { db.close(); }
}

module.exports = { seedFixture };
if (require.main === module) main();
