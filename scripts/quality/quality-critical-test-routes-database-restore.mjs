const DATABASE_RESTORE_LIFECYCLE_CONTRACT_TESTS = [
  'electron/ipc/commands.backupRestore.integration.test.ts'
];

export const DATABASE_RESTORE_CRITICAL_TEST_ROUTES = [
  {
    triggers: [
      /^electron\/database\/(?:backupRestore|connection|guardedBetterSqliteDatabase|sqliteBackupRestore|sqliteConnectionCoordinator)\.ts$/u,
      /^electron\/ipc\/commands\.ts$/u
    ],
    tests: DATABASE_RESTORE_LIFECYCLE_CONTRACT_TESTS
  }
];
