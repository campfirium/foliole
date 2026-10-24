import { createCompanionPreviewShareInboxPlugin, createCompanionPreviewSyncPlugin } from './companionPreviewHostPlugins';

// Dev-only stand-in for the native Capacitor bridge. The companion Vite dev server injects
// this module ahead of the app, so `@capacitor/core` finds a custom platform and plugin headers
// the way it finds them inside the Android or iOS shell. Production code never imports it, and
// it must not import `@capacitor/core` itself, which would initialize before the bridge exists.

type PreviewMethod = (options: unknown) => Promise<unknown>;
type PreviewPlugins = Record<string, Record<string, PreviewMethod>>;

export const COMPANION_PREVIEW_SQLITE_ENDPOINT = '/__foliole_preview/sqlite';
// Must equal COMPANION_BROWSER_PREVIEW_PLATFORM in companionRuntimeCapabilities.
export const COMPANION_PREVIEW_PLATFORM = 'foliole-browser-preview';

// Every method the SQLite connection wrapper may call; the dev server rejects the ones it lacks.
const SQLITE_METHODS = ['addSQLiteSuffix', 'addUpgradeStatement', 'beginTransaction', 'changeEncryptionSecret',
  'checkConnectionsConsistency', 'checkEncryptionSecret', 'clearEncryptionSecret', 'close', 'closeConnection',
  'closeNCConnection', 'commitTransaction', 'copyFromAssets', 'createConnection', 'createNCConnection',
  'createSyncTable', 'deleteDatabase', 'deleteExportedRows', 'deleteOldDatabases', 'echo', 'enableLoadExtension',
  'execute', 'executeSet', 'exportToJson', 'getDatabaseList', 'getFromHTTPRequest', 'getFromLocalDiskToStore',
  'getMigratableDbList', 'getNCDatabasePath', 'getSyncDate', 'getTableList', 'getUrl', 'getVersion',
  'importFromJson', 'initWebStore', 'isDBExists', 'isDBOpen', 'isDatabase', 'isDatabaseEncrypted',
  'isInConfigBiometricAuth', 'isInConfigEncryption', 'isJsonValid', 'isNCDatabase', 'isSecretStored',
  'isTableExists', 'isTransactionActive', 'loadExtension', 'moveDatabasesAndAddSuffix', 'open', 'query',
  'rollbackTransaction', 'run', 'saveToLocalDisk', 'saveToStore', 'setEncryptionSecret', 'setSyncDate'];

async function callPreviewSqlite(method: string, options: unknown) {
  const response = await fetch(COMPANION_PREVIEW_SQLITE_ENDPOINT, {
    body: JSON.stringify({ method, options }), headers: { 'Content-Type': 'application/json' }, method: 'POST'
  });
  if (!response.ok) throw new Error(`Companion preview database is unavailable (${response.status}).`);
  const reply = await response.json() as { code?: string; message?: string; ok: boolean; result?: unknown };
  if (reply.ok) return reply.result;
  throw Object.assign(new Error(reply.message ?? 'Companion preview database failed.'), reply.code ? { code: reply.code } : {});
}

export function createCompanionPreviewPlugins(hostName: string): PreviewPlugins {
  return {
    CapacitorSQLite: Object.fromEntries(SQLITE_METHODS.map((method) =>
      [method, (options: unknown) => callPreviewSqlite(method, options)])),
    // A copied device library keeps its own host name, so opening it does not move host-owned state.
    FolioleCompanionBootstrap: {
      loadBootstrap: async () => ({ booted_at: new Date().toISOString(), database_path: null,
        database_ready: false, host_name: hostName, runtime_kind: 'web-preview' })
    },
    FolioleCompanionShareInbox: createCompanionPreviewShareInboxPlugin(),
    FolioleCompanionSync: createCompanionPreviewSyncPlugin(hostName)
  };
}

/** Builds the `window.Capacitor` seed that the native shells normally provide. */
export function createCompanionPreviewBridge(plugins: PreviewPlugins) {
  const method = (plugin: string, name: string) => {
    const call = plugins[plugin]?.[name];
    if (!call) throw new Error(`${plugin}.${name}() is unavailable in the companion preview.`);
    return call;
  };
  return {
    PluginHeaders: Object.entries(plugins).map(([name, implementation]) => ({
      name,
      methods: Object.keys(implementation).map((methodName) =>
        ({ name: methodName, rtype: methodName === 'addListener' ? 'callback' : 'promise' }))
    })),
    nativePromise: (plugin: string, name: string, options: unknown) => method(plugin, name)(options),
    // Preview plugins never emit events; the id only lets the caller remove its listener again.
    nativeCallback: (plugin: string, name: string, options: unknown) => {
      void method(plugin, name)(options);
      return `${plugin}:${name}:preview`;
    }
  };
}

declare global {
  interface Window { __FOLIOLE_COMPANION_PREVIEW_HOST__?: string }
}

export function installCompanionPreviewHost(target: object, hostName: string) {
  Object.assign(target, {
    Capacitor: createCompanionPreviewBridge(createCompanionPreviewPlugins(hostName)),
    CapacitorCustomPlatform: { name: COMPANION_PREVIEW_PLATFORM, plugins: {} }
  });
}

if (typeof window !== 'undefined' && typeof window.__FOLIOLE_COMPANION_PREVIEW_HOST__ === 'string') {
  installCompanionPreviewHost(window, window.__FOLIOLE_COMPANION_PREVIEW_HOST__);
}
