/* global Buffer, process */

export async function loadDesktopDnsSdIdentityPreflight(app, groupId) {
  if (!/^group-[0-9a-f-]{36}$/u.test(groupId ?? '')) {
    throw new Error('Desktop DNS-SD identity preflight requires a full Sync Group id.');
  }
  return app.evaluate(async ({ app: electronApp }, expectedGroupId) => {
    const pathApi = process.getBuiltinModule('node:path');
    const moduleApi = process.getBuiltinModule('node:module');
    if (!pathApi || !moduleApi) throw new Error('Node built-ins unavailable.');
    const mainPath = process.env.FOLIOLE_HIDDEN_CREDENTIAL_MAIN_PATH
      || pathApi.join(electronApp.getAppPath(), 'main.js');
    const loadModule = moduleApi.createRequire(mainPath);
    const mainRoot = pathApi.dirname(mainPath);
    const connection = loadModule(pathApi.join(mainRoot, 'database', 'connection.js'));
    const identityOwner = loadModule(pathApi.join(mainRoot, 'deviceAnchorStore.js'));
    const validatorOwner = loadModule('@foliole/desktop-dnssd');
    const database = connection.openDatabaseConnection();
    const result = await identityOwner.loadDesktopDeviceIdentity({
      groupId: expectedGroupId, libraryPath: database.dbPath
    });
    validatorOwner._validateTxt({ device_id: result.identity.identity_key });
    return {
      canonicalLibraryPath: result.identity.canonical_library_path,
      deviceIdTxtEntryBytes: Buffer.byteLength(`device_id=${result.identity.identity_key}`, 'utf8'),
      identityKey: result.identity.identity_key
    };
  }, groupId);
}

export async function validateDesktopDnsSdIdentity(app, identityKey) {
  return app.evaluate(({ app: electronApp }, value) => {
    const pathApi = process.getBuiltinModule('node:path');
    const moduleApi = process.getBuiltinModule('node:module');
    if (!pathApi || !moduleApi) throw new Error('Node built-ins unavailable.');
    const mainPath = process.env.FOLIOLE_HIDDEN_CREDENTIAL_MAIN_PATH
      || pathApi.join(electronApp.getAppPath(), 'main.js');
    const loadModule = moduleApi.createRequire(mainPath);
    loadModule('@foliole/desktop-dnssd')._validateTxt({ device_id: value });
    return Buffer.byteLength(`device_id=${value}`, 'utf8');
  }, identityKey);
}
