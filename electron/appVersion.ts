import { createRequire } from 'node:module';

type VersionedElectronApp = {
  getVersion(): string;
};

const requireFromModule = createRequire(import.meta.url);

function cleanVersion(value: string | undefined) {
  return value?.trim() ?? '';
}

function readPackageVersion() {
  for (const packagePath of ['../package.json', '../../package.json']) {
    try {
      const manifest = requireFromModule(packagePath) as { version?: string };
      const version = cleanVersion(manifest.version);
      if (version) return version;
    } catch {
      // Source and compiled Electron files live at different depths.
    }
  }
  return '';
}

export function resolveFolioleAppVersion(
  app: VersionedElectronApp,
  env: NodeJS.ProcessEnv = process.env,
  electronVersion = process.versions.electron
) {
  const appVersion = cleanVersion(app.getVersion());
  const packageVersion = cleanVersion(env.FOLIOLE_APP_VERSION) || cleanVersion(env.npm_package_version) || readPackageVersion();

  if (packageVersion && appVersion === electronVersion) {
    return packageVersion;
  }
  return appVersion || packageVersion;
}
