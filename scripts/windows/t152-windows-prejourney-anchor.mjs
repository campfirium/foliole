/* global process */

import fs from 'node:fs';
import path from 'node:path';

function inside(parent, child) {
  const relative = path.win32.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.win32.sep}`)
    && relative !== '..' && !path.win32.isAbsolute(relative));
}

async function captureProductFacts(app) {
  return app.evaluate(async ({ app: electronApp }) => {
    const moduleApi = process.getBuiltinModule('node:module');
    const pathApi = process.getBuiltinModule('node:path');
    const fsApi = process.getBuiltinModule('node:fs');
    const bufferApi = process.getBuiltinModule('node:buffer');
    if (!moduleApi || !pathApi || !fsApi || !bufferApi) throw new Error('Node built-ins unavailable.');
    const mainPath = process.env.FOLIOLE_HIDDEN_CREDENTIAL_MAIN_PATH
      || pathApi.join(electronApp.getAppPath(), 'main.js');
    const loadModule = moduleApi.createRequire(mainPath);
    const mainRoot = pathApi.dirname(mainPath);
    const connection = loadModule(pathApi.join(mainRoot, 'database', 'connection.js'));
    const anchorOwner = loadModule(pathApi.join(mainRoot, 'deviceAnchorStore.js'));
    const database = connection.openDatabaseConnection();
    const anchorFile = anchorOwner.resolveDesktopDeviceAnchorFilePath();
    const anchor = await anchorOwner.loadOrCreateDesktopDeviceAnchor(anchorFile);
    return { anchorFile, anchorType: typeof anchor,
      anchorUtf8Bytes: bufferApi.Buffer.byteLength(anchor, 'utf8'), anchorValue: anchor,
      canonicalDatabasePath: fsApi.realpathSync(database.dbPath), databasePath: database.dbPath };
  });
}

function assertNoNetworkLifecycle(runtimeLog) {
  const forbidden = [
    /register_started/u, /register_completed/u, /browse_started/u,
    /discover_sync_groups/u, /request_sync_group_join/u, /sync_run/u
  ];
  if (forbidden.some((pattern) => pattern.test(runtimeLog))) {
    throw new Error('G3 crossed its pre-network lifecycle boundary.');
  }
}

export async function runT152WindowsAnchorAdmission({ closeSession, evidenceRoot,
  invokeCommand, openSession, owner, paths }) {
  if (process.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT !== undefined) {
    throw new Error('G3 anchor state root was already defined.');
  }
  process.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT = owner.taskRoot;
  let session;
  let closeResult;
  try {
    const expectedDatabasePath = path.win32.join(owner.libraryRoot, 'Data', 'foliole.db');
    if (fs.existsSync(expectedDatabasePath)) {
      throw new Error('G3 task-owned database was not empty before product launch.');
    }
    session = await openSession(paths, evidenceRoot);
    const facts = await captureProductFacts(session.app);
    const overview = await invokeCommand(session.page, 'load_sync_group_overview');
    if (overview.sync_group !== null || !inside(owner.libraryRoot, facts.databasePath)
        || !inside(owner.taskRoot, facts.anchorFile)) {
      throw new Error('G3 product facts escaped the owner or created a Sync Group.');
    }
    closeResult = await closeSession(session);
    session = null;
    const runtimeLogPath = path.join(evidenceRoot, 'sync-group-runtime.log');
    const runtimeLog = fs.existsSync(runtimeLogPath) ? fs.readFileSync(runtimeLogPath, 'utf8') : '';
    assertNoNetworkLifecycle(runtimeLog);
    return { ...facts, closeResult, databaseAbsentBeforeLaunch: true,
      expectedDatabasePath, lifecycle: { advertisementRegistered: false,
      createSyncGroupCalled: false, deviceIdentityCreated: false, discoveryStarted: false,
      groupCreated: false, productClosed: true, requestStarted: false, syncStarted: false },
    overview: { joinCandidateCount: overview.join_candidates?.length ?? 0, syncGroup: null } };
  } finally {
    delete process.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT;
    if (session) await closeSession(session).catch(() => undefined);
  }
}
