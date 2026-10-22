export const NATIVE_DATABASE_UPGRADE_COMMANDS = {
  loadDatabaseUpgradeStatus: 'load_database_upgrade_status'
} as const;

/** Answered before the library opens, so the startup window can show an upgrade in progress. */
export type NativeDatabaseUpgradeStatus =
  | { state: 'starting' }
  | { completed: number; state: 'upgrading'; total: number }
  | { state: 'ready' };

export type NativeDatabaseUpgradeCommandMap = {
  [NATIVE_DATABASE_UPGRADE_COMMANDS.loadDatabaseUpgradeStatus]: {
    args: undefined;
    result: NativeDatabaseUpgradeStatus;
  };
};
