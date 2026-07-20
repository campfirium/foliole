#!/usr/bin/env node
/* global console, process */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cwd, exit } from 'node:process';
import { spawnSync } from 'node:child_process';

import {
  iosResourceCommand,
  iosXcodebuildResourceArgs,
  resolveIosResourceMode
} from '../ios/ios-resource-profile.mjs';

// iOS sync work must reuse the shared TS sync core, native command contracts,
// DbPort semantics, and sync pack capability model.
// Do not copy Android private store, runner, generated Java, or SQL business
// logic into Swift. Stop before adding iOS native dependencies, runtime
// fallback, or plugin behavior that has not been checked against official docs.

if (process.platform !== 'darwin') {
  console.error('iOS SQLite capability gate must run on macOS with Xcode.');
  exit(1);
}

const pluginDir = join(cwd(), 'node_modules/@capacitor-community/sqlite');
const testDir = join(pluginDir, 'ios/PluginTests');
mkdirSync(testDir, { recursive: true });
writeFileSync(join(testDir, 'FolioleSqliteCapabilityTests.swift'), swiftTestSource());

const workspace = prepareSwiftPackageWorkspace(pluginDir);
const scheme = resolveScheme(workspace);
const destination = resolveSimulatorDestination();
const resourceMode = resolveIosResourceMode();
const task = iosResourceCommand('xcodebuild', [
  'test',
  '-workspace',
  workspace,
  '-scheme',
  scheme,
  '-destination',
  destination,
  ...iosXcodebuildResourceArgs(resourceMode, { testing: true }),
  '-only-testing:CapacitorSQLitePluginTests/FolioleSqliteCapabilityTests/testAttachTransactionBlobAndSqlSurface'
], resourceMode);
const result = spawnSync(task.command, task.args, {
  encoding: 'utf8',
  stdio: 'inherit'
});

if (result.status !== 0) {
  exit(result.status ?? 1);
}

function prepareSwiftPackageWorkspace(workingDirectory) {
  const workspace = join(workingDirectory, '.swiftpm/xcode/package.xcworkspace');
  mkdirSync(workspace, { recursive: true });
  writeFileSync(join(workspace, 'contents.xcworkspacedata'), swiftPackageWorkspaceSource());
  return workspace;
}

function resolveScheme(workspace) {
  const result = spawnSync('xcodebuild', ['-list', '-json', '-workspace', workspace], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    console.error(result.stderr);
    exit(result.status ?? 1);
  }
  const list = JSON.parse(result.stdout);
  const schemes = list.project?.schemes ?? list.workspace?.schemes ?? [];
  const scheme = ['CapacitorCommunitySqlite', 'CapacitorSQLitePlugin'].find((candidate) => schemes.includes(candidate));
  if (!scheme) {
    console.error(`Could not find Capacitor SQLite xcodebuild scheme. Available: ${schemes.join(', ')}`);
    exit(1);
  }
  return scheme;
}

function swiftPackageWorkspaceSource() {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Workspace version="1.0">\n' +
    '   <FileRef location="self:"></FileRef>\n' +
    '</Workspace>\n';
}

function resolveSimulatorDestination() {
  const result = spawnSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    console.error(result.stderr);
    exit(result.status ?? 1);
  }
  const devices = JSON.parse(result.stdout).devices ?? {};
  for (const [runtime, entries] of Object.entries(devices)) {
    if (!runtime.includes('iOS')) continue;
    const iphone = entries.find((entry) => entry.isAvailable && /^iPhone /.test(entry.name));
    if (iphone) return `platform=iOS Simulator,id=${iphone.udid}`;
  }
  console.error('Could not find an available iPhone simulator.');
  exit(1);
}

function swiftTestSource() {
  return String.raw`
import XCTest
@testable import CapacitorSQLitePlugin

final class FolioleSqliteCapabilityTests: XCTestCase {
    func testAttachTransactionBlobAndSqlSurface() throws {
        try ensureDocumentsDirectoryExists()

        var config = SqliteConfig()
        config.iosIsEncryption = 0
        let sqlite = CapacitorSQLite(config: config)
        let suffix = UUID().uuidString.replacingOccurrences(of: "-", with: "")
        let mainName = "foliole_ios_capability_\(suffix)"
        let incomingName = "foliole_ios_capability_pack_\(suffix)"

        print("foliole-step create-connections")
        try sqlite.createConnection(mainName, encrypted: false, mode: "no-encryption", version: 1, vUpgDict: [:], readonly: false)
        try sqlite.createConnection(incomingName, encrypted: false, mode: "no-encryption", version: 1, vUpgDict: [:], readonly: false)
        print("foliole-step open-main")
        try sqlite.open(mainName, readonly: false)
        print("foliole-step open-incoming")
        try sqlite.open(incomingName, readonly: false)
        defer {
            try? sqlite.closeConnection(mainName, readonly: false)
            try? sqlite.closeConnection(incomingName, readonly: false)
            try? sqlite.deleteDatabase(mainName, readonly: false)
            try? sqlite.deleteDatabase(incomingName, readonly: false)
        }

        print("foliole-step seed")
        _ = try sqlite.execute(mainName, statements: "CREATE TABLE main_nodes (id TEXT PRIMARY KEY, title TEXT NOT NULL, body BLOB)", transaction: false, readonly: false)
        _ = try sqlite.execute(incomingName, statements: "CREATE TABLE pack_nodes (id TEXT PRIMARY KEY, title TEXT NOT NULL, body BLOB)", transaction: false, readonly: false)
        _ = try sqlite.execute(incomingName, statements: "INSERT INTO pack_nodes (id, title, body) VALUES ('node-1', 'Synced body', X'010203')", transaction: false, readonly: false)

        let incomingUrl = try sqlite.getUrl(incomingName, readonly: false)
        let incomingPath = URL(string: incomingUrl)?.path ?? incomingUrl
        print("foliole-step attach \(incomingPath)")
        _ = try sqlite.execute(mainName, statements: "ATTACH DATABASE '\(incomingPath)' AS incoming", transaction: false, readonly: false)
        defer { _ = try? sqlite.execute(mainName, statements: "DETACH DATABASE incoming", transaction: false, readonly: false) }

        print("foliole-step insert-select")
        _ = try sqlite.beginTransaction(mainName)
        do {
            _ = try sqlite.execute(mainName, statements: "INSERT OR REPLACE INTO main_nodes (id, title, body) SELECT id, title, body FROM incoming.pack_nodes", transaction: false, readonly: false)
            _ = try sqlite.commitTransaction(mainName)
        } catch {
            _ = try? sqlite.rollbackTransaction(mainName)
            throw error
        }

        let rows = dataRows(try sqlite.query(mainName, statement: "SELECT title, length(body) AS body_len FROM main_nodes WHERE EXISTS (SELECT 1 FROM incoming.pack_nodes WHERE pack_nodes.id = main_nodes.id)", values: [], readonly: false))
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows[0]["title"] as? String, "Synced body")
        XCTAssertEqual(rows[0]["body_len"] as? Int64, 3)

        let tables = dataRows(try sqlite.query(mainName, statement: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", values: ["main_nodes"], readonly: false))
        XCTAssertEqual(tables.count, 1)

        let changes = dataRows(try sqlite.query(mainName, statement: "SELECT changes() AS value", values: [], readonly: false))
        XCTAssertNotNil(changes[0]["value"])
    }

    private func ensureDocumentsDirectoryExists() throws {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        try FileManager.default.createDirectory(at: documents, withIntermediateDirectories: true)
    }

    private func dataRows(_ rows: [[String: Any]]) -> [[String: Any]] {
        rows.filter { $0["ios_columns"] == nil }
    }
}
`;
}
