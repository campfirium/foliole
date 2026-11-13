import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

import type { NativeCommandRegistryEntry } from './nativeCommandRegistry.js';

export const NATIVE_IMPORT_FILE_COMMAND_REGISTRY = [
  { command: NATIVE_COMMANDS.runClipboardImport, route: 'import', capability: 'importMutation' },
  { command: NATIVE_COMMANDS.runDirectoryImport, route: 'import', capability: 'importMutation' },
  { command: NATIVE_COMMANDS.runTextFileImport, route: 'import', capability: 'importMutation' },
  { command: NATIVE_COMMANDS.listSuperMemoImports, route: 'import', capability: 'read' },
  { command: NATIVE_COMMANDS.previewSuperMemoAdjustment, route: 'import', capability: 'read' },
  { command: NATIVE_COMMANDS.adjustSuperMemoImport, route: 'import', capability: 'importMutation' },
  { command: NATIVE_COMMANDS.runSuperMemoImport, route: 'import', capability: 'importMutation' },
  { command: NATIVE_COMMANDS.previewSuperMemoImport, route: 'import', capability: 'read' },
  { command: NATIVE_COMMANDS.selectImportDirectory, route: 'import', capability: 'read' },
  { command: NATIVE_COMMANDS.selectImportTextFile, route: 'import', capability: 'read' },
] as const satisfies readonly NativeCommandRegistryEntry[];
