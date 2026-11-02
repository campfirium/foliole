import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { prepareIosAcceptanceCache, prepareIosRuntimeContractCache } from './ios-local-storage.mjs';

export function compileSqliteBackendContract(root, binary) {
  const cache = prepareIosRuntimeContractCache(root);
  const sources = prepareIosAcceptanceCache(root).sourcePackages;
  const zip = path.join(sources, 'checkouts/ZIPFoundation');
  if (!existsSync(path.join(zip, 'Package.swift'))) {
    execFileSync('xcodebuild', ['-resolvePackageDependencies', '-project', 'ios/App/App.xcodeproj',
      '-scheme', 'App', '-onlyUsePackageVersionsFromResolvedFile',
      '-derivedDataPath', prepareIosAcceptanceCache(root).derivedData,
      '-clonedSourcePackagesDirPath', sources], { cwd: root, stdio: 'pipe', timeout: 180_000 });
  }
  const scratch = path.join(cache.scratchPath, 'sqlite-backend-zip');
  const args = ['--package-path', zip, '--scratch-path', scratch, '--build-system', 'native'];
  execFileSync('swift', ['build', ...args, '--target', 'ZIPFoundation', '--jobs', '2'],
    { stdio: 'pipe', timeout: 180_000 });
  const bin = execFileSync('swift', ['build', ...args, '--show-bin-path'], { encoding: 'utf8' }).trim();
  const objects = readdirSync(path.join(bin, 'ZIPFoundation.build'))
    .filter(name => name.endsWith('.o')).map(name => path.join(bin, 'ZIPFoundation.build', name));
  const plugin = path.join(root, 'node_modules/@capacitor-community/sqlite');
  const sourceRoot = path.join(plugin, 'ios/Plugin');
  const files = readdirSync(sourceRoot, { recursive: true }).filter(name => name.endsWith('.swift'))
    .map(name => path.join(sourceRoot, name))
    .filter(file => !/^import Capacitor$/mu.test(readFileSync(file, 'utf8')));
  execFileSync('xcrun', ['swiftc', '-module-cache-path', cache.swiftpmModuleCache,
    '-I', path.join(bin, 'Modules'), ...sqliteLinkArgs(plugin, sources), ...files,
    path.join(root, 'scripts/ios/fixtures/SqliteSystemBackendContract.swift'), ...objects, '-o', binary],
  { stdio: 'pipe', timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
}

function sqliteLinkArgs(plugin, sourcePackages) {
  // Compile the same behavioral contract against the actual installed backend, including before the patch.
  if (!readFileSync(path.join(plugin, 'Package.swift'), 'utf8').includes('SQLCipher.swift')) return ['-lsqlite3'];
  const framework = path.join(sourcePackages,
    'artifacts/sqlcipher.swift/SQLCipher/SQLCipher.xcframework/macos-arm64_x86_64');
  return ['-F', framework, '-framework', 'SQLCipher', `-Xlinker`, '-rpath', '-Xlinker', framework];
}
