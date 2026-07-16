import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const CONTRACT_FILES = [
  'lib/platform/nativeAssistantContract.ts',
  'lib/platform/nativeContract.ts',
  'lib/platform/nativeDiscoursePublishContract.ts',
  'lib/platform/nativeDisplayScaleContract.ts',
  'lib/platform/nativeExternalSearchCommandMap.ts',
  'lib/platform/nativeFoliolePublishContract.ts',
  'lib/platform/nativeImportCommandMap.ts',
  'lib/platform/nativeInitialLibrarySetupContract.ts',
  'lib/platform/nativeLocalFileCommandMap.ts',
  'lib/platform/nativeMoveCommandMap.ts',
  'lib/platform/nativeReadwiseCommandMap.ts',
  'lib/platform/nativeRemoteImageCommandMap.ts',
  'lib/platform/nativeSearchIndexCommandMap.ts',
  'lib/platform/nativeSyncCommandMap.ts',
  'lib/platform/nativeTrashCommandMap.ts',
  'lib/platform/nativeUpdateContract.ts',
  'lib/platform/nativeUtilityCommandMap.ts',
  'lib/platform/nativeWordPressPublishContract.ts'
];
const ELECTRON_HANDLER_FILES = [
  'electron/ipc/assistantCommands.ts',
  'electron/ipc/companionPairingCommands.ts',
  'electron/ipc/displayScaleCommands.ts',
  'electron/ipc/importCommands.ts',
  'electron/ipc/initialLibrarySetupCommands.ts',
  'electron/ipc/reviewCommands.ts',
  'electron/ipc/storageAttachmentCommands.ts',
  'electron/ipc/storageCommandSupport.ts',
  'electron/ipc/storageCommands.ts',
  'electron/ipc/storageExternalSearchCommands.ts',
  'electron/ipc/storageLocalFileCommands.ts',
  'electron/ipc/storageNodeMutationCommands.ts',
  'electron/ipc/storagePublishingCommands.ts',
  'electron/ipc/storageReadCommands.ts',
  'electron/ipc/storageSettingsCommands.ts',
  'electron/ipc/storageSyncCommands.ts',
  'electron/ipc/updateCommands.ts',
  'electron/ipc/windowCommands.ts'
];
const REGISTRY_FILE = 'electron/ipc/nativeCommandRegistry.ts';
const INVENTORY_FILE = '.lab/specs/shared/platform/native-command-contract-map.md';
const LEGACY_INVENTORY_COMMANDS = new Set(['assistant_delete_thread_index']);

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function readFile(repoRoot, relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function collectCommandDefinitions(repoRoot) {
  const source = readFile(repoRoot, 'lib/platform/nativeCommands.ts');
  const commands = [];
  for (const match of source.matchAll(/^\s*([A-Za-z0-9_]+):\s*'([^']+)'/gm)) {
    commands.push({ key: match[1], value: match[2] });
  }
  return commands;
}

function collectNativeCommandKeys(source) {
  return new Set([...source.matchAll(/\bNATIVE_COMMANDS\.([A-Za-z0-9_]+)/g)].map((match) => match[1]));
}

function collectRegistry(repoRoot) {
  const source = readFile(repoRoot, REGISTRY_FILE);
  return [...source.matchAll(/\{\s*command:\s*NATIVE_COMMANDS\.([A-Za-z0-9_]+),([^}]*)\}/g)].map((match) => ({
    key: match[1],
    route: match[2].match(/route:\s*'([^']+)'/)?.[1] ?? null,
    capability: match[2].match(/capability:\s*'([^']+)'/)?.[1] ?? null
  }));
}

function collectReferencedCommandKeys(repoRoot, files) {
  const references = new Set();
  for (const file of files) {
    if (!fs.existsSync(path.join(repoRoot, file))) {
      continue;
    }
    for (const key of collectNativeCommandKeys(readFile(repoRoot, file))) {
      references.add(key);
    }
  }
  return references;
}

function collectInventory(repoRoot) {
  const inventoryPath = path.join(repoRoot, INVENTORY_FILE);
  if (!fs.existsSync(inventoryPath)) {
    return {
      commandValues: null,
      explicitMissingHandlers: new Set()
    };
  }
  const source = fs.readFileSync(inventoryPath, 'utf8');
  return {
    explicitMissingHandlers: new Set(
      [...source.matchAll(/missing-handler:\s*`([^`]+)`/g)].map((match) => match[1])
    ),
    commandValues: new Set([...source.matchAll(/`([a-z][a-z0-9_]+)`/g)].map((match) => match[1]))
  };
}

function missingEntries(expected, actual) {
  return expected.filter((item) => !actual.has(item));
}

function duplicateEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => seen.size === seen.add(entry).size);
}

function formatViolation(kind, entries) {
  return entries.map((entry) => `${kind}: ${entry}`);
}

export function inspectNativeCommandContracts({ repoRoot = resolveRepoRoot() } = {}) {
  const commands = collectCommandDefinitions(repoRoot);
  const commandKeys = commands.map((command) => command.key);
  const commandValues = commands.map((command) => command.value);
  const contractKeys = collectReferencedCommandKeys(repoRoot, CONTRACT_FILES);
  const handlerKeys = collectReferencedCommandKeys(repoRoot, ELECTRON_HANDLER_FILES);
  const registry = collectRegistry(repoRoot);
  const registryKeys = new Set(registry.map((entry) => entry.key));
  const inventory = collectInventory(repoRoot);

  const missingContractKeys = missingEntries(commandKeys, contractKeys);
  const missingRegistryKeys = missingEntries(commandKeys, registryKeys);
  const duplicateRegistryKeys = duplicateEntries(registry.map((entry) => entry.key));
  const missingRegistryRoutes = registry.filter((entry) => !entry.route).map((entry) => entry.key);
  const missingRegistryCapabilities = registry.filter((entry) => !entry.capability).map((entry) => entry.key);
  const missingInventoryValues = inventory.commandValues ? missingEntries(commandValues, inventory.commandValues) : [];
  const staleInventoryValues = inventory.commandValues
    ? [...inventory.commandValues].filter(
        (value) => !commandValues.includes(value) && !LEGACY_INVENTORY_COMMANDS.has(value)
      )
    : [];
  const missingHandlerKeys = commands
    .filter((command) => !handlerKeys.has(command.key) && !inventory.explicitMissingHandlers.has(command.value))
    .map((command) => `${command.key} (${command.value})`);
  const conflictingHandlerGaps = commands
    .filter((command) => handlerKeys.has(command.key) && inventory.explicitMissingHandlers.has(command.value))
    .map((command) => `${command.key} (${command.value})`);

  const violations = [
    ...formatViolation('missing contract map entry', missingContractKeys),
    ...formatViolation('missing native command registry entry', missingRegistryKeys),
    ...formatViolation('duplicate native command registry entry', duplicateRegistryKeys),
    ...formatViolation('missing native command registry route', missingRegistryRoutes),
    ...formatViolation('missing native command registry capability', missingRegistryCapabilities),
    ...formatViolation('missing inventory entry', missingInventoryValues),
    ...formatViolation('stale inventory entry', staleInventoryValues),
    ...formatViolation('missing electron handler or explicit gap', missingHandlerKeys),
    ...formatViolation('handler exists but inventory declares missing-handler', conflictingHandlerGaps)
  ];

  return {
    commandCount: commands.length,
    explicitMissingHandlerCount: inventory.explicitMissingHandlers.size,
    ok: violations.length === 0,
    violations
  };
}

function printResult(result, { stdout = process.stdout, stderr = process.stderr } = {}) {
  if (result.ok) {
    stdout.write(
      `[check-native-command-contracts] status: OK commands=${result.commandCount} explicitMissingHandlers=${result.explicitMissingHandlerCount}\n`
    );
    return;
  }
  stderr.write(`[check-native-command-contracts] status: VIOLATION violations=${result.violations.length}\n`);
  for (const violation of result.violations) {
    stderr.write(`[check-native-command-contracts] ${violation}\n`);
  }
}

export function runCli({
  repoRoot = process.env.FOLIOLE_NATIVE_CONTRACT_ROOT?.trim() || resolveRepoRoot(),
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  const result = inspectNativeCommandContracts({ repoRoot });
  printResult(result, { stdout, stderr });
  return {
    exitCode: result.ok ? 0 : 1,
    result
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli().exitCode;
}
