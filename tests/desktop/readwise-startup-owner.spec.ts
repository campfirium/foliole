import { expect, test } from './harness/fixtures';

// The fixture owns an isolated native library and the desktop resource gate.
test('persists Readwise startup recovery after another database owner releases', async ({ desktopApp }) => {
  const result = await desktopApp.evaluate(async () => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const settings = require(pathApi.join(process.cwd(), 'dist/electron/database/settingsStore.js'));
    const identity = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseRemoteIdentity.js'));
    const scheduler = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiScheduler.js'));
    const state = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiScheduleState.js'));
    const connectionRef = await connection.runWithDatabaseConnectionOwner(() => {
      scheduler.stopReadwiseApiScheduler();
      const ref = identity.ensureReadwiseRemoteSource().connectionRef;
      settings.saveJsonSetting('readwise_source_mode', { mode: 'off', version: 1 });
      settings.saveJsonSetting('readwise_api_schedule_state', {
        connectionRef: ref, initialProgress: null, lastResult: null, nextRunAt: null, version: 2,
        lifecycle: { error_reason: null, finished_at: null, kind: 'initial', progress: null,
          queued_at: '2026-10-01T00:00:00.000Z', run_id: 'native-abandoned', stage: 'writing',
          started_at: '2026-10-01T00:00:01.000Z', status: 'running', trigger: 'startup' }
      });
      return ref;
    });
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const owner = connection.runWithDatabaseConnectionOwner(() => gate);
    let settled = false;
    const startup = scheduler.startReadwiseApiScheduler();
    void startup.then(() => { settled = true; }, () => { settled = true; });
    let pending = false;
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      pending = !settled;
    } finally { release(); await owner; }
    await startup;
    return connection.runWithDatabaseConnectionOwner(() => ({
      pending, recovered: state.loadReadwiseApiScheduleState(connectionRef)
    }));
  });
  expect(result).toMatchObject({ pending: true, recovered: {
    lastResult: null, nextRunAt: null,
    lifecycle: { run_id: 'native-abandoned', status: 'interrupted', stage: 'writing' }
  } });
  await test.info().attach('startup-recovery', {
    body: JSON.stringify(result, null, 2), contentType: 'application/json'
  });
});
