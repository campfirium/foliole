import path from 'node:path';

import {
  backupSqliteDatabase,
  resolveDefaultSqliteBackupPath,
  restoreSqliteDatabase
} from '../electron/database/sqliteBackupRestore.ts';

async function main() {
  const [command, ...argv] = process.argv.slice(2);

  if (command !== 'backup' && command !== 'restore') {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const flags = parseFlags(argv);
  const dbPath = requireFlag(flags, 'db-path');

  if (command === 'backup') {
    await runBackup(dbPath, flags);
    return;
  }

  await runRestore(dbPath, flags);
}

async function runBackup(dbPath: string, flags: Map<string, string>) {
  const destinationPath = flags.get('destination-path') ?? flags.get('output');
  const result = await backupSqliteDatabase({
    sourcePath: resolvePath(dbPath),
    destinationPath: destinationPath ? resolvePath(destinationPath) : resolveDefaultSqliteBackupPath(dbPath)
  });
  console.log(JSON.stringify(result));
}

async function runRestore(dbPath: string, flags: Map<string, string>) {
  const sourcePath = requireFlag(flags, 'source-path');
  const result = await restoreSqliteDatabase({
    sourcePath: resolvePath(sourcePath),
    targetPath: resolvePath(dbPath)
  });
  console.log(JSON.stringify(result));
}

function parseFlags(argv: string[]) {
  const flags = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith('--')) {
      throw new Error(`unexpected argument: ${token ?? '<empty>'}`);
    }

    const flagName = token.slice(2);
    if (!flagName) {
      throw new Error('empty flag name');
    }

    const flagValue = argv[index + 1];
    if (!flagValue || flagValue.startsWith('--')) {
      throw new Error(`missing value for --${flagName}`);
    }

    flags.set(flagName, flagValue);
    index += 1;
  }

  return flags;
}

function requireFlag(flags: Map<string, string>, flagName: string) {
  const value = flags.get(flagName)?.trim();
  if (!value) {
    throw new Error(`missing required flag --${flagName}`);
  }
  return value;
}

function resolvePath(filePath: string) {
  return path.resolve(filePath);
}

function printUsage() {
  console.error('usage:');
  console.error('  npm run sqlite:backup -- --db-path <db> [--destination-path <backup>]');
  console.error('  npm run sqlite:restore -- --db-path <db> --source-path <backup>');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[sqlite-maintenance] ${message}`);
  process.exit(1);
});
