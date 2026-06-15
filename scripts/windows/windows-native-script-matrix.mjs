import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_PACKAGE_JSON = path.resolve('package.json');

export const WINDOWS_NATIVE_MAIN_SCRIPTS = [
  'dev',
  'build',
  'lint:desktop:full',
  'lint:files',
  'typecheck:desktop',
  'test:desktop',
  'test:files',
  'windows:native:check',
  'windows:client:native',
  'windows:preview:native',
  'quality:fast:native',
  'test:e2e:desktop:native:hidden',
  'test:e2e:desktop:native:visible',
  'release:windows:package',
  'windows:package',
  'windows:package:install',
  'windows:package:native',
];

const LEGACY_WSL_MIRROR_SCRIPTS = new Set([
  'windows:preview',
  'windows:preview:sandbox',
  'desktop:inspect:renders',
  'desktop:test:windows',
  'dev:screenshot',
]);

const ANDROID_HOST_PATTERNS = [/^android:/, /^quality:android/, /^test:android$/, /^test:release:android$/, /^check:android/];
const IOS_HOST_PATTERNS = [/^ios:/, /^quality:ios$/, /^check:ios/];
const AGENT_LEGACY_PATTERNS = [/^agent:/];

const NATIVE_ALTERNATIVES = new Map([
  ['windows:preview', 'windows:preview:native'],
  ['windows:preview:sandbox', 'windows:preview:native'],
  ['desktop:test:windows', 'test:e2e:desktop:native:hidden or test:e2e:desktop:native:visible'],
  ['desktop:inspect:renders', 'test:e2e:desktop:native:hidden with a render diagnostic spec'],
  ['dev:screenshot', 'test:e2e:desktop:native:visible with an explicit screenshot spec'],
  ['lint:desktop', 'lint:desktop:full or lint:files'],
  ['lint', 'lint:full or lint:files'],
  ['quality:fast', 'quality:fast:native'],
  ['test:e2e:desktop:agent', 'test:e2e:desktop:native:hidden or test:e2e:desktop:native:visible'],
]);

function matchesAny(value, patterns) {
  return patterns.some((pattern) => pattern.test(value));
}

function usesShellCommand(command) {
  return /\bbash\b|\.sh\b/.test(command);
}

function usesWsl(command) {
  return /\bwsl(?:\.exe)?\b|\bwslpath\b|\/mnt\//i.test(command);
}

export function classifyPackageScript(name, command) {
  if (WINDOWS_NATIVE_MAIN_SCRIPTS.includes(name)) {
    return 'windows-native-main';
  }
  if (LEGACY_WSL_MIRROR_SCRIPTS.has(name)) {
    return 'wsl-mirror-legacy';
  }
  if (matchesAny(name, ANDROID_HOST_PATTERNS)) {
    return 'android-host';
  }
  if (matchesAny(name, IOS_HOST_PATTERNS)) {
    return 'ios-host';
  }
  if (matchesAny(name, AGENT_LEGACY_PATTERNS)) {
    return 'agent-legacy';
  }
  if (/\bxvfb-run\b/.test(command)) {
    return 'linux-headless-legacy';
  }
  if (usesShellCommand(command)) {
    return 'git-bash-portable';
  }
  return 'windows-native-direct';
}

export function buildWindowsNativeScriptMatrix(scripts) {
  return Object.entries(scripts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, command]) => ({
      name,
      command,
      classification: classifyPackageScript(name, command),
      nativeAlternative: NATIVE_ALTERNATIVES.get(name) ?? '',
    }));
}

export function validateWindowsNativeScriptMatrix(scripts) {
  const errors = [];

  for (const scriptName of WINDOWS_NATIVE_MAIN_SCRIPTS) {
    const command = scripts[scriptName];
    if (!command) {
      errors.push(`Missing Windows native main script: ${scriptName}`);
      continue;
    }
    if (usesShellCommand(command) || usesWsl(command)) {
      errors.push(`Windows native main script must not use bash/WSL: ${scriptName}`);
    }
  }

  for (const row of buildWindowsNativeScriptMatrix(scripts)) {
    if ((usesShellCommand(row.command) || usesWsl(row.command)) && row.classification === 'windows-native-direct') {
      errors.push(`Shell or WSL script lacks explicit classification: ${row.name}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function formatWindowsNativeScriptMatrix(matrix) {
  const rows = [
    '| script | classification | native path | command |',
    '| --- | --- | --- | --- |',
  ];
  for (const row of matrix) {
    rows.push(
      `| \`${row.name}\` | ${row.classification} | ${row.nativeAlternative || '-'} | \`${row.command.replaceAll('|', '\\|')}\` |`,
    );
  }
  return `${rows.join('\n')}\n`;
}

function readPackageScripts(packageJsonPath) {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return packageJson.scripts ?? {};
}

export function runWindowsNativeScriptMatrix(packageJsonPath = DEFAULT_PACKAGE_JSON) {
  const scripts = readPackageScripts(packageJsonPath);
  const matrix = buildWindowsNativeScriptMatrix(scripts);
  const validation = validateWindowsNativeScriptMatrix(scripts);
  return {
    matrix,
    validation,
    markdown: formatWindowsNativeScriptMatrix(matrix),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const result = runWindowsNativeScriptMatrix(process.argv[2] ?? DEFAULT_PACKAGE_JSON);
  process.stdout.write(result.markdown);
  if (!result.validation.ok) {
    for (const error of result.validation.errors) {
      process.stderr.write(`${error}\n`);
    }
    process.exitCode = 1;
  }
}
