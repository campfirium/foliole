import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { digest } from '../security/security-inputs.mjs';

const FRI = 'CB302BF0-6B5B-5737-8DA8-21F8081E19E7';
const FRI_UDID = '00008110-001109A802A0401E';

export function qualifyFriEnvironment(details) {
  const result = details.result;
  if (result?.deviceProperties?.name !== 'Fri' || result.hardwareProperties?.udid !== FRI_UDID
    || !result.deviceProperties.osVersionNumber || !result.deviceProperties.osBuildUpdate) {
    throw new Error('Fixed iPhone identity or actual OS version is unavailable');
  }
  return { device: 'Fri', os: result.deviceProperties.osVersionNumber,
    build: result.deviceProperties.osBuildUpdate, transport: result.connectionProperties?.transportType,
    webkit: 'System WebKit follows this OS; standalone runtime build not observed',
    crypto: 'System Common Crypto follows this OS; standalone version not published' };
}

export function collectIosEnvironment({ root, inventory, device = false,
  run = (command, args) => execFileSync(command, args,
    { cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024 }) }) {
  const result = { platform: process.platform, arch: process.arch, checkedAt: new Date().toISOString(),
    tools: {}, components: {}, errors: [], device: { status: 'unsupported', reason: 'Fixed iPhone was not queried in this environment' } };
  const capture = (key, collect) => {
    try { return collect(); }
    catch (error) { result.errors.push({ key, reason: error.message }); return { status: 'error', reason: error.message }; }
  };
  if (process.platform !== 'darwin') {
    result.errors.push({ key: 'apple-native', reason: 'Actual Mac tools/artifacts require macOS; Linux lock scanning is separate' });
    return result;
  }
  for (const [key, command, args] of [
    ['xcode', 'xcodebuild', ['-version']], ['swift', 'swift', ['--version']],
    ['sdk', 'xcrun', ['--sdk', 'iphoneos', '--show-sdk-version']],
    ['sdkBuild', 'xcrun', ['--sdk', 'iphoneos', '--show-sdk-build-version']],
    ['sdkPath', 'xcrun', ['--sdk', 'iphoneos', '--show-sdk-path']],
    ['macOS', 'sw_vers', []]
  ]) result.tools[key] = capture(key, () => run(command, args).trim());
  if (inventory.status === 'resolved') {
    result.components = capture('resolved-components', () => resolvedComponents(inventory, run));
    result.plugins = capture('npm-plugin-versions', () => inventory.graphs.app.manifests.filter(row => row.source.includes('/node_modules/')).map(row => {
      const manifest = path.join(path.dirname(row.source), 'package.json');
      const raw = readFileSync(manifest);
      const pkg = JSON.parse(raw);
      return { name: pkg.name, version: pkg.version, manifest, sha256: digest(raw), edges: row.edges };
    }));
  } else result.errors.push({ key: 'resolved-components', reason: 'Live matching App/host resolution is unavailable' });
  if (device) result.device = capture('fixed-iPhone', () => ({ status: 'observed',
    ...qualifyFriEnvironment(JSON.parse(run('xcrun', ['devicectl', '--quiet', 'device', 'info', 'details',
      '--device', FRI, '--json-output', '-']))) }));
  return result;
}

function resolvedComponents(inventory, run) {
  const artifacts = inventory.graphs.app.artifacts;
  const sql = artifacts.find(row => row.targetName === 'SQLCipher');
  if (!sql?.path || !sql.source?.checksum) throw new Error('Resolved SQLCipher binary identity is missing');
  const header = path.join(sql.path, 'ios-arm64/SQLCipher.framework/Headers/sqlite3.h');
  const raw = readFileSync(header);
  const sqlite = /^#define SQLITE_VERSION\s+"([\d.]+)"/mu.exec(raw.toString())?.[1];
  if (!sqlite) throw new Error('Actual iOS framework SQLite version is missing');
  const framework = path.join(sql.path, 'macos-arm64_x86_64/SQLCipher.framework/SQLCipher');
  const native = JSON.parse(run('python3', ['-c', SQLCIPHER_VERSION_PROBE, framework]));
  const expected = inventory.graphs.app.pins.find(row => row.identity === 'sqlcipher.swift').version;
  if (native.sqlite !== sqlite || native.sqlcipher.split(' ')[0] !== expected) {
    throw new Error('SQLCipher actual core/header version does not match resolved wrapper');
  }
  return { sqlcipher: { wrapper: expected, actualMacCore: native.sqlcipher, sqlite,
    header, headerSha256: digest(raw), artifact: sql.source,
    scope: 'Resolved iOS header and same XCFramework Mac slice; no iPhone runtime claim',
    crypto: 'Apple Community provider is OS Common Crypto; vendor matrix 4.19.0, OS-specific version' },
  binaries: artifacts.map(row => ({ name: row.targetName, source: row.source,
    plistVersion: run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString',
      path.join(row.path, 'ios-arm64', `${row.targetName}.framework/Info.plist`)]).trim() })),
  cordova: { version: 'Capacitor-pinned fork; independent Apache Cordova version unknown',
    reason: 'Framework plist 1.0 and compatibility macros do not establish Apache source version' } };
}

const SQLCIPHER_VERSION_PROBE = `import ctypes,json,sys
s=ctypes.CDLL(sys.argv[1]);s.sqlite3_libversion.restype=ctypes.c_char_p
db=ctypes.c_void_p();assert s.sqlite3_open(b':memory:',ctypes.byref(db))==0
CB=ctypes.CFUNCTYPE(ctypes.c_int,ctypes.c_void_p,ctypes.c_int,ctypes.POINTER(ctypes.c_char_p),ctypes.POINTER(ctypes.c_char_p))
r={'sqlite':s.sqlite3_libversion().decode()}
def cb(a,n,v,c):
 r['sqlcipher']=v[0].decode();return 0
c=CB(cb);assert s.sqlite3_exec(db,b'PRAGMA cipher_version',c,None,None)==0
s.sqlite3_close(db);print(json.dumps(r))`;
