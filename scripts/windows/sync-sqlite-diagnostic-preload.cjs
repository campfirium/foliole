/* global __filename */
const { Buffer } = require('node:buffer');
const process = require('node:process');
const { setInterval } = require('node:timers');
/* Diagnostic-only preload; never imported by product code. */
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const root = process.env.FOLIOLE_SQLITE_DIAGNOSTIC_ROOT;
if (root && process.versions.electron && process.env.ELECTRON_RUN_AS_NODE === '1') install();

function install() {
  require('./sync-sqlite-diagnostic-children.cjs').install(__filename);
  const modulePath = require.resolve(path.resolve('node_modules/better-sqlite3'));
  const Database = require(modulePath);
  const states = new Map();
  const file = path.join(root, `sqlite-${process.pid}.jsonl`);
  const emit = value => fs.appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(),
    pid: process.pid, ...value })}\n`);
  emit({ event: 'diagnostic_installed', argv: process.argv });
  const instrument = db => {
    if (states.has(db)) return;
    const name = db.name;
    if (name !== ':memory:' && name !== '' && !inside(path.resolve('.tmp'), name)) {
      db.close(); throw new Error('sqlite_diagnostic_requires_repository_temporary_database');
    }
    states.set(db, { name, commits: [], writeCommits: [], wrote: false, implicitWrites: [], begins: [], busy: 0, transactionStack: null });
    if (!db.readonly && process.env.FOLIOLE_SQLITE_DIAGNOSTIC_MODE === 'NORMAL') db.pragma('synchronous = NORMAL');
    const exec = db.exec;
    db.exec = function (sql) { return measure({ source: sql, database: db, readonly: false },
      states.get(db), 'exec', () => exec.call(db, sql), emit); };
    const close = db.close;
    db.close = function () { emit(summary(db, states.get(db))); states.delete(db); return close.call(db); };
    emit({ event: 'connection', name, readonly: db.readonly });
  };
  const probe = new Database(':memory:');
  const statementPrototype = Object.getPrototypeOf(probe.prepare('SELECT 1'));
  for (const method of ['run', 'get', 'all']) {
    const original = statementPrototype[method];
    statementPrototype[method] = function (...args) {
      instrument(this.database);
      const state = states.get(this.database);
      return measure(this, state, method, () => Reflect.apply(original, this, args), emit);
    };
  }
  probe.close();
  require.cache[modulePath].exports = new Proxy(Database, {
    construct(target, args) { assertTemporary(args[0]); const db = Reflect.construct(target, args); instrument(db); return db; },
    apply(target, receiver, args) { assertTemporary(args[0]); const db = Reflect.apply(target, receiver, args); instrument(db); return db; }
  });
  const snapshot = () => { for (const [db, state] of states) if (db.open) emit(summary(db, state)); };
  setInterval(snapshot, 5000).unref();
  process.on('exit', snapshot);
  require('./sync-sqlite-diagnostic-profile.cjs').start(root, emit);
  traceCommands(emit);
}

function inside(rootPath, file) {
  const relative = path.relative(fs.realpathSync(rootPath), fs.realpathSync(file));
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function measure(statement, state, method, execute, emit) {
  const sql = statement.source.trim();
  const commit = /^COMMIT\b/i.test(sql);
  const begin = /^BEGIN\b/i.test(sql);
  const implicit = !statement.readonly && !statement.database.inTransaction && /^(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql);
  if (!statement.readonly && /^(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) state.wrote = true;
  const stack = commit || begin ? new Error('sqlite operation call site').stack : null;
  if (begin) state.transactionStack = stack;
  const started = performance.now();
  let succeeded = false;
  try { const result = execute(); succeeded = true; return result; }
  catch (error) { if (String(error.code).startsWith('SQLITE_BUSY')) state.busy++; throw error; }
  finally {
    const ms = performance.now() - started;
    if (succeeded && commit) { state.commits.push(ms); if (state.wrote) state.writeCommits.push(ms); state.wrote = false; state.transactionStack = null; }
    if (succeeded && begin) { state.begins.push(ms); state.wrote = false; }
    if (succeeded && implicit) state.implicitWrites.push(ms);
    if (/^ROLLBACK\b/i.test(sql)) state.transactionStack = null;
    if (ms >= 100) emit({ event: 'slow_sqlite_operation', database: state.name, method,
      operation: sql.split(/\s+/)[0], ms, stack, succeeded });
  }
}

function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = p => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0;
  return { count: values.length, totalMs: values.reduce((a, b) => a + b, 0),
    p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99), maxMs: sorted.at(-1) ?? 0 };
}

function summary(db, state) {
  return { event: 'sqlite_summary', database: state.name,
    synchronous: db.pragma('synchronous', { simple: true }), journalMode: db.pragma('journal_mode', { simple: true }),
    explicitCommits: distribution(state.commits), writeCommits: distribution(state.writeCommits), implicitWriteStatementMs: distribution(state.implicitWrites),
    begins: distribution(state.begins), busy: state.busy, inTransaction: db.inTransaction,
    transactionEntryStack: state.transactionStack };
}

function traceCommands(emit) {
  const pending = new Map();
  process.on('message', message => {
    if (!message || typeof message.action !== 'string') return;
    pending.set(message.id, { action: message.action, started: performance.now() });
    emit({ event: 'fixture_command_start', id: message.id, action: message.action });
  });
  if (!process.send) return;
  const send = process.send;
  process.send = function (message, ...args) {
    const command = pending.get(message?.id);
    if (command) {
      emit({ event: 'fixture_command_end', id: message.id, action: command.action,
        ms: performance.now() - command.started, error: message.error ?? null });
      pending.delete(message.id);
    }
    return Reflect.apply(send, this, [message, ...args]);
  };
}

function assertTemporary(file) {
  if (file === undefined || file === '' || file === ':memory:' || Buffer.isBuffer(file)) return;
  if (typeof file !== 'string') throw new Error('sqlite_diagnostic_database_path_invalid');
  const real = fs.existsSync(file) ? fs.realpathSync(file)
    : path.join(fs.realpathSync(path.dirname(path.resolve(file))), path.basename(file));
  const relative = path.relative(fs.realpathSync(path.resolve('.tmp')), real);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw new Error('sqlite_diagnostic_requires_repository_temporary_database');
}
