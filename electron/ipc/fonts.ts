import { execFile } from 'node:child_process';

export interface RuntimeSystemFontCatalog {
  fonts: string[];
  monospace_fonts: string[];
}

const MONOSPACE_NAME_HINT = /mono|code|console|consolas|courier|menlo|fira|cascadia/i;
const WINDOWS_STYLE_SUFFIX = /[\s-]+(?:thin|extra[\s-]?light|ultra[\s-]?light|light|book|regular|normal|medium|semi[\s-]?bold|demi[\s-]?bold|bold|extra[\s-]?bold|ultra[\s-]?bold|black|heavy|italic|oblique|condensed|compressed|expanded)(?:[\s-]+(?:italic|oblique))?$/i;
type ExecFileFn = (file: string, args: string[]) => Promise<string>;

function normalizeFontNames(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function detectMonospaceNames(values: string[]) {
  return values.filter((fontName) => MONOSPACE_NAME_HINT.test(fontName));
}

function collapseWindowsStyleFamilies(values: string[]) {
  const families = new Set(values);
  return values.filter((value) => {
    const base = value.replace(WINDOWS_STYLE_SUFFIX, '').trim();
    return base === value || !families.has(base);
  });
}

async function runCommand(exec: ExecFileFn, file: string, args: string[]) {
  try {
    return await exec(file, args);
  } catch {
    return '';
  }
}

function parsePowerShellFontPropertyNames(rawOutput: string) {
  return rawOutput
    .split(/\r?\n/)
    .flatMap((row) => expandWindowsRegistryFontName(row.trim()));
}

function expandWindowsRegistryFontName(rawName: string) {
  const cleaned = rawName.replace(/^@/, '').replace(/\s*\([^)]*\)\s*$/g, '').trim();
  if (!cleaned) {
    return [];
  }
  return cleaned
    .split(/\s+&\s+/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

function parseWindowsRegistryFonts(rawOutput: string) {
  const rows = rawOutput.split(/\r?\n/);
  const names: string[] = [];
  for (const row of rows) {
    const match = row.match(/^\s*([^\r\n]+?)\s+REG_\w+\s+.+$/);
    if (!match) {
      continue;
    }
    const rowName = match[1];
    if (!rowName) {
      continue;
    }
    for (const name of expandWindowsRegistryFontName(rowName)) {
      names.push(name);
    }
  }
  return names;
}

async function listWindowsFontsViaPowerShell(exec: ExecFileFn) {
  const familiesScript =
    "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }";
  const output = await runCommand(exec, 'powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    familiesScript
  ]);
  return parsePowerShellFontPropertyNames(output);
}

async function listWindowsFonts(exec: ExecFileFn) {
  const powershellFonts = await listWindowsFontsViaPowerShell(exec);
  if (powershellFonts.length > 0) {
    return collapseWindowsStyleFamilies(powershellFonts);
  }
  const [hklmOutput, hkcuOutput] = await Promise.all([
    runCommand(exec, 'reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts']),
    runCommand(exec, 'reg', ['query', 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'])
  ]);
  return collapseWindowsStyleFamilies([...parseWindowsRegistryFonts(hklmOutput), ...parseWindowsRegistryFonts(hkcuOutput)]);
}

async function listLinuxFonts(exec: ExecFileFn) {
  const output = await runCommand(exec, 'fc-list', [':', 'family']);
  if (!output) {
    return [];
  }
  return output
    .split(/\r?\n/)
    .flatMap((row) => row.split(','))
    .map((fontName) => fontName.trim())
    .filter((fontName) => fontName.length > 0);
}

async function listMacFonts(exec: ExecFileFn) {
  const output = await runCommand(exec, 'system_profiler', ['SPFontsDataType', '-json']);
  if (!output) {
    return [];
  }
  try {
    const payload = JSON.parse(output) as { SPFontsDataType?: Array<{ enabled?: string; typefaces?: Array<{ enabled?: string; family?: string }> }> };
    return (payload.SPFontsDataType ?? []).flatMap((font) => {
      if (font.enabled === 'no') return [];
      return (font.typefaces ?? [])
        .filter((face) => face.enabled !== 'no')
        .map((face) => face.family?.trim() ?? '')
        .filter((family) => family.length > 0 && !family.startsWith('.') && family !== 'LastResort');
    });
  } catch {
    return [];
  }
}

export async function listSystemFontsForPlatform(platform: NodeJS.Platform, exec: ExecFileFn): Promise<RuntimeSystemFontCatalog> {
  const rawNames =
    platform === 'win32' ? await listWindowsFonts(exec) : platform === 'darwin' ? await listMacFonts(exec) : await listLinuxFonts(exec);
  const fonts = normalizeFontNames(rawNames);
  return {
    fonts,
    monospace_fonts: detectMonospaceNames(fonts)
  };
}

export function createSystemFontCatalogLoader(platform: NodeJS.Platform, exec: ExecFileFn) {
  let catalogPromise: Promise<RuntimeSystemFontCatalog> | null = null;
  return () => {
    catalogPromise ??= listSystemFontsForPlatform(platform, exec);
    return catalogPromise;
  };
}

const runExecFile: ExecFileFn = (file, args) => new Promise((resolve, reject) => {
  execFile(file, args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  }, (error, stdout) => error ? reject(error) : resolve(stdout));
});

export const listSystemFonts = createSystemFontCatalogLoader(process.platform, runExecFile);
