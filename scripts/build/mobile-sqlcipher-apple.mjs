import { appendFileSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { run } from './mobile-sqlcipher-sources.mjs';

const slices = [
  ['macosx', 'arm64-apple-macos13.0', 'macos-arm64'],
  ['macosx', 'x86_64-apple-macos13.0', 'macos-x86_64'],
  ['iphoneos', 'arm64-apple-ios15.0', 'ios-arm64'],
  ['iphonesimulator', 'arm64-apple-ios15.0-simulator', 'simulator-arm64'],
  ['iphonesimulator', 'x86_64-apple-ios15.0-simulator', 'simulator-x86_64']
];

function frameworkMetadata(sdk, version) {
  return {
    CFBundleExecutable: 'SQLCipher', CFBundleIdentifier: 'net.zetetic.SQLCipher',
    CFBundleName: 'SQLCipher', CFBundlePackageType: 'FMWK',
    CFBundleShortVersionString: version, CFBundleVersion: version,
    CFBundleSupportedPlatforms: [sdk === 'macosx' ? 'MacOSX' : sdk === 'iphoneos' ? 'iPhoneOS' : 'iPhoneSimulator'],
    MinimumOSVersion: sdk === 'macosx' ? '13.0' : '15.0'
  };
}

function prepareFramework(directory, core, sdk, version) {
  const framework = path.join(directory, 'SQLCipher.framework');
  mkdirSync(path.join(framework, 'Headers'), { recursive: true });
  mkdirSync(path.join(framework, 'Modules'), { recursive: true });
  copyFileSync(path.join(core.build, 'sqlite3.h'), path.join(framework, 'Headers/sqlite3.h'));
  copyFileSync(path.join(core.source, 'macosx/SQLCipher.h'), path.join(framework, 'Headers/SQLCipher.h'));
  copyFileSync(path.join(core.nativeRoot, 'FolioleFolderBackup.h'), path.join(framework, 'Headers/FolioleFolderBackup.h'));
  appendFileSync(path.join(framework, 'Headers/SQLCipher.h'), '\n#include "FolioleFolderBackup.h"\n');
  copyFileSync(path.join(core.source, 'sqlcipher-resources/PrivacyInfo.xcprivacy'),
    path.join(framework, 'PrivacyInfo.xcprivacy'));
  copyFileSync(path.join(core.source, 'LICENSE.md'), path.join(framework, 'LICENSE.md'));
  writeFileSync(path.join(framework, 'Modules/module.modulemap'),
    'framework module SQLCipher { umbrella header "SQLCipher.h" export * module * { export * } }\n');
  const plist = path.join(framework, 'Info.plist');
  writeFileSync(plist, JSON.stringify(frameworkMetadata(sdk, version)));
  run('plutil', ['-convert', 'xml1', plist]);
  return framework;
}

function buildSlice(output, core, pins, slice) {
  const [sdk, target, name] = slice;
  const framework = prepareFramework(path.join(output, name), core, sdk, pins.version);
  const sdkPath = execFileSync('xcrun', ['--sdk', sdk, '--show-sdk-path'], { encoding: 'utf8' }).trim();
  const flags = pins.appleCompileOptions.map(option => `-DSQLITE_${option}`);
  const versionSource = path.join(output, 'version.c');
  run('xcrun', ['--sdk', sdk, 'clang', '-target', target, '-isysroot', sdkPath,
    '-O2', '-dynamiclib', '-DSQLCIPHER_CRYPTO_CC', '-DSQLITE_ENABLE_DBPAGE_VTAB',
    ...(sdk === 'macosx' ? [] : ['-DHAVE_GETHOSTUUID=0']), ...flags,
    '-install_name', '@rpath/SQLCipher.framework/SQLCipher',
    '-current_version', pins.version, '-compatibility_version', '1.0',
    '-I', core.build, '-I', core.nativeRoot,
    path.join(core.build, 'sqlite3.c'), path.join(core.nativeRoot, 'FolioleFolderBackup.c'),
    path.join(core.nativeRoot, 'FolioleFolderBackupTransport.c'), versionSource,
    '-framework', 'Security', '-framework', 'CoreFoundation', '-o', path.join(framework, 'SQLCipher')]);
  return framework;
}

function combine(output, core, pins, sdk, name, frameworks) {
  const framework = prepareFramework(path.join(output, name), core, sdk, pins.version);
  run('xcrun', ['lipo', '-create', ...frameworks.map(f => path.join(f, 'SQLCipher')),
    '-output', path.join(framework, 'SQLCipher')]);
  return framework;
}

export async function buildAppleSqlcipher({ cache, core, pins }) {
  if (process.platform !== 'darwin') throw new Error('Building the iOS SQLCipher framework requires macOS/Xcode');
  const output = path.join(cache, 'apple');
  const packageDirectory = path.join(output, 'SQLCipher.swift');
  const artifact = path.join(packageDirectory, 'SQLCipher.xcframework');
  const complete = path.join(packageDirectory, 'Package.swift');
  if (existsSync(complete)) return { artifact, packageDirectory, version: pins.version, provider: 'CommonCrypto' };
  mkdirSync(packageDirectory, { recursive: true });
  writeFileSync(path.join(output, 'version.c'),
    'double SQLCipherVersionNumber = 4.20;\nconst unsigned char SQLCipherVersionString[] = "4.20.0";\n');
  const built = slices.map(slice => buildSlice(output, core, pins, slice));
  const mac = combine(output, core, pins, 'macosx', 'macos-arm64_x86_64', built.slice(0, 2));
  const simulator = combine(output, core, pins, 'iphonesimulator', 'ios-arm64_x86_64-simulator', built.slice(3));
  run('xcodebuild', ['-create-xcframework', '-framework', mac, '-framework', built[2],
    '-framework', simulator, '-output', artifact]);
  writeFileSync(complete, `// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "SQLCipher", platforms: [.iOS(.v15), .macOS(.v13)],
    products: [.library(name: "SQLCipher", targets: ["SQLCipher"])],
    targets: [.binaryTarget(name: "SQLCipher", path: "SQLCipher.xcframework")])
`);
  return { artifact, packageDirectory, version: pins.version, provider: 'CommonCrypto' };
}
