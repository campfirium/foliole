import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildCanonicalAttachmentMigrationPlan } from '../../electron/attachments/canonicalAttachmentMigrationPlan.js';
import { hashFile, inventoryAttachmentFiles } from '../../electron/attachments/canonicalAttachmentPreflightFiles.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as new (
  path: string, options: { fileMustExist: boolean; readonly: boolean }
) => { close(): void; readonly: boolean };

interface PreflightPaths { assetsDir: string; databasePath: string; outputPath: string; snapshotDir?: string }

function parseArgs(argv: string[]): PreflightPaths {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key || !value || !['--assets', '--database', '--output', '--snapshot'].includes(key) || values.has(key)) {
      throw new Error('usage: --database <path> --assets <path> --output <path> [--snapshot <new directory>]');
    }
    values.set(key, value);
  }
  const snapshotDir = values.get('--snapshot');
  const result = {
    assetsDir: values.get('--assets') ?? '', databasePath: values.get('--database') ?? '',
    outputPath: values.get('--output') ?? '', ...(snapshotDir ? { snapshotDir } : {})
  };
  if (![result.assetsDir, result.databasePath, result.outputPath].every(path.isAbsolute) ||
      (result.snapshotDir && !path.isAbsolute(result.snapshotDir))) throw new Error('all_paths_must_be_absolute');
  const artifactRoot = path.resolve(process.cwd(), '.tmp', 'artifacts');
  for (const candidate of [result.outputPath, result.snapshotDir].filter(Boolean) as string[]) {
    const resolved = path.resolve(candidate);
    if (resolved !== artifactRoot && !resolved.startsWith(`${artifactRoot}${path.sep}`)) {
      throw new Error('output_and_snapshot_must_be_inside_tmp_artifacts');
    }
  }
  return result;
}

function databaseManifest(databasePath: string) {
  return [databasePath, `${databasePath}-wal`, `${databasePath}-shm`].flatMap((filePath) => {
    if (!fs.existsSync(filePath)) return [];
    const stat = fs.lstatSync(filePath);
    return [{ device: stat.dev, inode: stat.ino, mtimeMs: stat.mtimeMs, path: filePath,
      sha256: hashFile(filePath), sizeBytes: stat.size }];
  });
}

function productionManifest(databasePath: string, assetsDir: string) {
  const inventory = inventoryAttachmentFiles(assetsDir);
  return { assets: { files: inventory.files, root: inventory.root, unsupportedEntries: inventory.unsupportedEntries },
    databaseFiles: databaseManifest(databasePath) };
}

function stableJson(value: unknown) {
  return JSON.stringify(value);
}

function createDatabaseSnapshot(databasePath: string, snapshotDir: string) {
  fs.mkdirSync(path.dirname(snapshotDir), { recursive: true });
  fs.mkdirSync(snapshotDir);
  const snapshotDatabasePath = path.join(snapshotDir, path.basename(databasePath));
  for (const suffix of ['', '-wal', '-shm']) {
    const source = `${databasePath}${suffix}`;
    if (fs.existsSync(source)) fs.copyFileSync(source, `${snapshotDatabasePath}${suffix}`, fs.constants.COPYFILE_EXCL);
  }
  return { databasePath: snapshotDatabasePath, manifest: databaseManifest(snapshotDatabasePath) };
}

export function runCanonicalAttachmentPreflight(paths: PreflightPaths) {
  if (!fs.statSync(paths.databasePath).isFile()) throw new Error('database_path_not_file');
  const before = productionManifest(paths.databasePath, paths.assetsDir);
  const snapshot = paths.snapshotDir ? createDatabaseSnapshot(paths.databasePath, paths.snapshotDir) : null;
  const sqlite = new BetterSqlite3(snapshot?.databasePath ?? paths.databasePath, { fileMustExist: true, readonly: true });
  if (!sqlite.readonly) throw new Error('database_connection_not_readonly');
  let plan;
  try {
    plan = buildCanonicalAttachmentMigrationPlan(sqlite as never, paths.assetsDir);
  } finally {
    sqlite.close();
    if (paths.snapshotDir) fs.rmSync(paths.snapshotDir, { force: true, recursive: true });
  }
  const after = productionManifest(paths.databasePath, paths.assetsDir);
  const productionStateUnchanged = stableJson(before) === stableJson(after);
  const counts = Object.fromEntries(['canonicalize', 'image_mime_repair', 'known_missing',
    'no_bytes_unresolved', 'html_orphan_delete', 'residual_blocker'].map((decision) =>
    [decision, plan.items.filter((item) => item.decision === decision).length]));
  const receipt = {
    generatedAt: new Date().toISOString(), input: { assetsDir: plan.assetsRoot, databasePath: paths.databasePath },
    openContract: { fileMustExist: true, mode: snapshot ? 'readonly-frozen-snapshot' : 'readonly',
      productionInitializationCalled: false, ...(snapshot ? { snapshotManifest: snapshot.manifest } : {}) },
    plan, productionState: { after, before, unchanged: productionStateUnchanged }, summary: counts, version: 2
  };
  fs.mkdirSync(path.dirname(paths.outputPath), { recursive: true });
  fs.writeFileSync(paths.outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  if (!productionStateUnchanged) throw new Error('production_state_changed_during_preflight');
  return receipt;
}

function main() {
  const paths = parseArgs(process.argv.slice(2));
  const receipt = runCanonicalAttachmentPreflight(paths);
  process.stdout.write(`${JSON.stringify({ outputPath: paths.outputPath,
    residualBlockers: receipt.plan.residualBlockers.length, summary: receipt.summary }, null, 2)}\n`);
  if (receipt.plan.residualBlockers.length) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
