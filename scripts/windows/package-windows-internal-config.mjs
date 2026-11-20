import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const INTERNAL_APP_ID = 'com.foliole.desktop.internal';
export const INTERNAL_APP_NAME = 'foliole-internal';
export const INTERNAL_PRODUCT_NAME = 'Foliole Internal';
export const INTERNAL_OUTPUT_DIR = 'artifacts/windows-internal';
export const INTERNAL_BUILDER_CONFIG_PATH = '.tmp/electron-builder-internal.json';
export const INTERNAL_BUILD_RESOURCES_DIR = '.tmp/windows-internal-build-resources';
export const INTERNAL_NSIS_INCLUDE_PATH = `${INTERNAL_BUILD_RESOURCES_DIR}/installer.nsh`;
export const INTERNAL_CLI_DIR = `${INTERNAL_BUILD_RESOURCES_DIR}/cli`;
const CLI_SOURCE_DIR = 'build/cli';
const CLI_LAUNCHER = 'foliole.cmd';

export const INTERNAL_NSIS_INCLUDE = `!macro recreateExistingShortcut shortcutPath
  \${if} \${FileExists} "\${shortcutPath}"
    WinShell::UninstShortcut "\${shortcutPath}"
    Delete "\${shortcutPath}"
    Sleep 50
    CreateShortCut "\${shortcutPath}" "$appExe" "" "$appExe" 0 "" "" "\${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "\${shortcutPath}" "\${APP_ID}"
  \${endIf}
!macroend

!macro customInstall
  !insertmacro recreateExistingShortcut "$newStartMenuLink"
  !insertmacro recreateExistingShortcut "$newDesktopLink"
!macroend
`;

function timestamp(date) {
  return date.toISOString().replace(/\D/gu, '').slice(0, 14);
}

export function formatInternalBuildVersion(packageVersion, date = new Date()) {
  return `${packageVersion}-internal.${timestamp(date)}`;
}

export function createInternalBuilderConfig(baseConfig, internalVersion) {
  return {
    ...baseConfig,
    electronDist: 'node_modules/electron/dist',
    appId: INTERNAL_APP_ID,
    productName: INTERNAL_PRODUCT_NAME,
    directories: {
      ...baseConfig.directories,
      buildResources: INTERNAL_BUILD_RESOURCES_DIR,
      output: INTERNAL_OUTPUT_DIR
    },
    extraFiles: (baseConfig.extraFiles ?? []).map((entry) => (
      entry?.from === CLI_SOURCE_DIR ? { ...entry, from: INTERNAL_CLI_DIR } : entry
    )),
    extraMetadata: {
      ...(baseConfig.extraMetadata ?? {}),
      folioleBuildChannel: 'internal',
      name: INTERNAL_APP_NAME,
      productName: INTERNAL_PRODUCT_NAME,
      version: internalVersion
    },
    nsis: {
      ...baseConfig.nsis,
      include: INTERNAL_NSIS_INCLUDE_PATH,
      shortcutName: INTERNAL_PRODUCT_NAME
    },
    win: {
      ...baseConfig.win,
      artifactName: '${productName}-Setup-${version}-internal-win-${arch}.${ext}'
    }
  };
}

export function writeInternalBuilderConfig(rootDir, internalVersion) {
  const baseConfig = JSON.parse(readFileSync(resolve(rootDir, 'electron/builder.json'), 'utf8'));
  const config = createInternalBuilderConfig(baseConfig, internalVersion);
  mkdirSync(resolve(rootDir, INTERNAL_BUILD_RESOURCES_DIR), { recursive: true });
  mkdirSync(resolve(rootDir, '.tmp'), { recursive: true });
  writeFileSync(resolve(rootDir, INTERNAL_NSIS_INCLUDE_PATH), INTERNAL_NSIS_INCLUDE);
  if (config.extraFiles.some((entry) => entry?.from === INTERNAL_CLI_DIR)) writeInternalCliLauncher(rootDir);
  const configPath = resolve(rootDir, INTERNAL_BUILDER_CONFIG_PATH);
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return configPath;
}

// The shared launcher runs Foliole.exe; the Internal installer names its executable after the product.
export function createInternalCliLauncher(source) {
  const launcher = source.replaceAll('%~dp0..\\Foliole.exe', `%~dp0..\\${INTERNAL_PRODUCT_NAME}.exe`);
  if (launcher === source) throw new Error('Windows CLI launcher no longer names Foliole.exe');
  return launcher;
}

function writeInternalCliLauncher(rootDir) {
  const source = readFileSync(resolve(rootDir, CLI_SOURCE_DIR, CLI_LAUNCHER), 'utf8');
  mkdirSync(resolve(rootDir, INTERNAL_CLI_DIR), { recursive: true });
  writeFileSync(resolve(rootDir, INTERNAL_CLI_DIR, CLI_LAUNCHER), createInternalCliLauncher(source));
}
