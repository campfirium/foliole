import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const CONTRACT_FILES = [
  'lib/platform/nativeContract.ts',
  'lib/platform/nativeExternalSearchCommandMap.ts',
  'lib/platform/nativeImportCommandMap.ts',
  'lib/platform/nativeLocalFileCommandMap.ts',
  'lib/platform/nativeMoveCommandMap.ts',
  'lib/platform/nativeReadwiseCommandMap.ts',
  'lib/platform/nativeRemoteImageCommandMap.ts',
  'lib/platform/nativeSearchIndexCommandMap.ts',
  'lib/platform/nativeSyncCommandMap.ts',
  'lib/platform/nativeTrashCommandMap.ts',
  'lib/platform/nativeUtilityCommandMap.ts'
];
const ELECTRON_HANDLER_FILES = [
  'electron/ipc/companionPairingCommands.ts',
  'electron/ipc/importCommands.ts',
  'electron/ipc/reviewCommands.ts',
  'electron/ipc/storageAttachmentCommands.ts',
  'electron/ipc/storageCommandSupport.ts',
  'electron/ipc/storageCommands.ts',
  'electron/ipc/storageExternalSearchCommands.ts',
  'electron/ipc/storageLocalFileCommands.ts',
  'electron/ipc/storageNodeMutationCommands.ts',
  'electron/ipc/storageReadCommands.ts',
  'electron/ipc/storageSettingsCommands.ts',
  'electron/ipc/storageSyncCommands.ts',
  'electron/ipc/windowCommands.ts'
];
const SECURITY_CAPABILITY_FILES = [
  'electron/ipc/commandSecurityCapabilities.ts',
  'electron/ipc/commandSecurityCapabilityGroups.ts'
];
const INVENTORY_FILE = '.lab/specs/shared/platform/native-command-contract-map.md';

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

function formatViolation(kind, entries) {
  return entries.map((entry) => `${kind}: ${entry}`);
}

export function inspectNativeCommandContracts({ repoRoot = resolveRepoRoot() } = {}) {
  const commands = collectCommandDefinitions(repoRoot);
  const commandKeys = commands.map((command) => command.key);
  const commandValues = commands.map((command) => command.value);
  const contractKeys = collectReferencedCommandKeys(repoRoot, CONTRACT_FILES);
  const handlerKeys = collectReferencedCommandKeys(repoRoot, ELECTRON_HANDLER_FILES);
  const securityCapabilityKeys = collectReferencedCommandKeys(repoRoot, SECURITY_CAPABILITY_FILES);
  const inventory = collectInventory(repoRoot);

  const missingContractKeys = missingEntries(commandKeys, contractKeys);
  const missingSecurityCapabilityKeys = missingEntries(commandKeys, securityCapabilityKeys);
  const missingInventoryValues = inventory.commandValues ? missingEntries(commandValues, inventory.commandValues) : [];
  const missingHandlerKeys = commands
    .filter((command) => !handlerKeys.has(command.key) && !inventory.explicitMissingHandlers.has(command.value))
    .map((command) => `${command.key} (${command.value})`);

  const violations = [
    ...formatViolation('missing contract map entry', missingContractKeys),
    ...formatViolation('missing security capability entry', missingSecurityCapabilityKeys),
    ...formatViolation('missing inventory entry', missingInventoryValues),
    ...formatViolation('missing electron handler or explicit gap', missingHandlerKeys)
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
