import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const INTERNAL_APP_ID = 'com.foliole.desktop.internal';
export const INTERNAL_APP_NAME = 'foliole-internal';
export const INTERNAL_PRODUCT_NAME = 'Foliole Internal';
export const INTERNAL_OUTPUT_DIR = 'artifacts/windows-internal';
export const INTERNAL_BUILDER_CONFIG_PATH = '.tmp/electron-builder-internal.json';
export const INTERNAL_BUILD_RESOURCES_DIR = '.tmp/windows-internal-build-resources';

function timestamp(date) {
  return date.toISOString().replace(/\D/gu, '').slice(0, 14);
}

export function formatInternalBuildVersion(packageVersion, date = new Date()) {
  return `${packageVersion}-internal.${timestamp(date)}`;
}

export function createInternalBuilderConfig(baseConfig, internalVersion) {
  return {
    ...baseConfig,
    appId: INTERNAL_APP_ID,
    productName: INTERNAL_PRODUCT_NAME,
    directories: {
      ...baseConfig.directories,
      buildResources: INTERNAL_BUILD_RESOURCES_DIR,
      output: INTERNAL_OUTPUT_DIR
    },
    extraMetadata: {
      ...(baseConfig.extraMetadata ?? {}),
      folioleBuildChannel: 'internal',
      name: INTERNAL_APP_NAME,
      productName: INTERNAL_PRODUCT_NAME,
      version: internalVersion
    },
    nsis: {
      ...baseConfig.nsis,
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
  const configPath = resolve(rootDir, INTERNAL_BUILDER_CONFIG_PATH);
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return configPath;
}
