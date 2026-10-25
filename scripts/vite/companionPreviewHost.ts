import { createCompanionPreviewDocument } from './companionPreviewDocument';
import { createCompanionPreviewShareInboxPlugin, createCompanionPreviewSyncPlugin } from './companionPreviewHostPlugins';
import { observeCompanionPreviewReadiness } from './companionPreviewReadiness';
import type {} from './companionPreviewShell';

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
const SQLITE_METHODS = ['closeAllConnections', 'addSQLiteSuffix', 'addUpgradeStatement', 'beginTransaction', 'changeEncryptionSecret',
  'checkConnectionsConsistency', 'checkEncryptionSecret', 'clearEncryptionSecret', 'close', 'closeConnection',
  'closeNCConnection', 'commitTransaction', 'copyFromAssets', 'createConnection', 'createNCConnection',
  'createSyncTable', 'deleteDatabase', 'deleteExportedRows', 'deleteOldDatabases', 'echo', 'enableLoadExtension',
  'execute', 'executeSet', 'exportToJson', 'getDatabaseList', 'getFromHTTPRequest', 'getFromLocalDiskToStore',
  'getMigratableDbList', 'getNCDatabasePath', 'getSyncDate', 'getTableList', 'getUrl', 'getVersion',
  'importFromJson', 'initWebStore', 'isDBExists', 'isDBOpen', 'isDatabase', 'isDatabaseEncrypted',
  'isInConfigBiometricAuth', 'isInConfigEncryption', 'isJsonValid', 'isNCDatabase', 'isSecretStored',
  'isTableExists', 'isTransactionActive', 'loadExtension', 'moveDatabasesAndAddSuffix', 'open', 'query',
  'rollbackTransaction', 'run', 'saveToLocalDisk', 'saveToStore', 'setEncryptionSecret', 'setSyncDate'];

export function createCompanionPreviewPlugins(hostName: string, session = crypto.randomUUID(),
  call = createCompanionPreviewDocument(session).call): PreviewPlugins {
  return {
    CapacitorSQLite: Object.fromEntries(SQLITE_METHODS.map((method) =>
      [method, (options: unknown) => call(method, options)])),
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
  interface Window {
    __FOLIOLE_COMPANION_PREVIEW_HOST__?: string;
    __foliolePreviewFlush?: () => Promise<void>;
  }
}

export function installCompanionPreviewHost(target: object, hostName: string) {
  const connection = createCompanionPreviewDocument();
  const { session } = connection;
  Object.assign(target, {
    Capacitor: createCompanionPreviewBridge(createCompanionPreviewPlugins(hostName, session, connection.call)),
    CapacitorCustomPlatform: { name: COMPANION_PREVIEW_PLATFORM, plugins: {} }
  });
  if (typeof window !== 'undefined' && target === window) {
    let exiting = false;
    window.__foliolePreviewClose = async () => {
      exiting = true;
      await window.__foliolePreviewFlush?.();
      await connection.close();
    };
    observeCompanionPreviewReadiness(window, () => window.parent.__foliolePreviewShell?.ready(window));
    import.meta.hot?.on('vite:beforeFullReload', async () => {
      const shell = window.parent.__foliolePreviewShell;
      if (!shell) return;
      await shell.beforeReload(window);
      try { await window.__foliolePreviewClose?.(); }
      catch (error) {
        shell.failed(window, error instanceof Error ? error.message : String(error));
        throw error;
      }
    });
    import.meta.hot?.on('vite:error', ({ err }) => window.parent.__foliolePreviewShell?.failed(window, err.message));
    window.addEventListener('error', (event) => {
      if (!exiting) window.parent.__foliolePreviewShell?.failed(window, event.message);
    });
    window.addEventListener('unhandledrejection', (event) => {
      if (!exiting) window.parent.__foliolePreviewShell?.failed(window, String(event.reason));
    });
    window.addEventListener('pagehide', (event) => {
      if (!event.isTrusted || event.persisted) return;
      navigator.sendBeacon(COMPANION_PREVIEW_SQLITE_ENDPOINT,
        JSON.stringify({ method: 'closeAllConnections', options: {}, session }));
    });
  }
}

if (typeof window !== 'undefined' && typeof window.__FOLIOLE_COMPANION_PREVIEW_HOST__ === 'string') {
  installCompanionPreviewHost(window, window.__FOLIOLE_COMPANION_PREVIEW_HOST__);
}
