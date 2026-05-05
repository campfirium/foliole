import { execFileSync } from 'node:child_process';

export interface RuntimeSystemFontCatalog {
  fonts: string[];
  monospace_fonts: string[];
}

const MONOSPACE_NAME_HINT = /mono|code|console|consolas|courier|menlo|fira|cascadia/i;
let cachedCatalog: RuntimeSystemFontCatalog | null = null;

type ExecFileSyncFn = typeof execFileSync;

function normalizeFontNames(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function detectMonospaceNames(values: string[]) {
  return values.filter((fontName) => MONOSPACE_NAME_HINT.test(fontName));
}

function runCommand(exec: ExecFileSyncFn, file: string, args: string[]) {
  try {
    return exec(file, args, {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024
    }) as string;
  } catch {
    return '';
  }
}

function parseWindowsRegistryFonts(rawOutput: string) {
  const rows = rawOutput.split(/\r?\n/);
  const names: string[] = [];
  for (const row of rows) {
    const match = row.match(/^\s*([^\r\n]+?)\s+REG_\w+\s+.+$/);
    if (!match) {
      continue;
    }
    const baseName = match[1].replace(/^@/, '').replace(/\s*\([^)]*\)\s*$/g, '').trim();
    if (baseName) {
      names.push(baseName);
    }
  }
  return names;
}

function listWindowsFonts(exec: ExecFileSyncFn) {
  const hklmOutput = runCommand(exec, 'reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts']);
  const hkcuOutput = runCommand(exec, 'reg', ['query', 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts']);
  return [...parseWindowsRegistryFonts(hklmOutput), ...parseWindowsRegistryFonts(hkcuOutput)];
}

function listLinuxFonts(exec: ExecFileSyncFn) {
  const output = runCommand(exec, 'fc-list', [':', 'family']);
  if (!output) {
    return [];
  }
  return output
    .split(/\r?\n/)
    .flatMap((row) => row.split(','))
    .map((fontName) => fontName.trim())
    .filter((fontName) => fontName.length > 0);
}

function listMacFonts(exec: ExecFileSyncFn) {
  const output = runCommand(exec, 'system_profiler', ['SPFontsDataType']);
  if (!output) {
    return [];
  }
  return output
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*Full Name:\s*(.+)$/)?.[1]?.trim() ?? '')
    .filter((fontName) => fontName.length > 0);
}

export function listSystemFontsForPlatform(platform: NodeJS.Platform, exec: ExecFileSyncFn): RuntimeSystemFontCatalog {
  const rawNames =
    platform === 'win32' ? listWindowsFonts(exec) : platform === 'darwin' ? listMacFonts(exec) : listLinuxFonts(exec);
  const fonts = normalizeFontNames(rawNames);
  return {
    fonts,
    monospace_fonts: detectMonospaceNames(fonts)
  };
}

export function listSystemFonts(): RuntimeSystemFontCatalog {
  if (cachedCatalog) {
    return cachedCatalog;
  }
  cachedCatalog = listSystemFontsForPlatform(process.platform, execFileSync);
  return cachedCatalog;
}
