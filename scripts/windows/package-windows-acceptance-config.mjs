/* global process */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const WINDOWS_ACCEPTANCE_CONFIG = '.tmp/electron-builder-windows-acceptance.json';

export function resolveAcceptanceBaselineVersion(argv = process.argv) {
  const prefix = '--acceptance-baseline-version=';
  const value = argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (value === undefined) return null;
  if (!/^\d+\.\d+\.\d+$/u.test(value)) {
    throw new Error('Windows acceptance baseline version must be an exact stable semver.');
  }
  return value;
}

export function resolveWindowsAcceptanceOutputDir(version) {
  return `.tmp/artifacts/windows-update-baseline-${version}`;
}

export function createWindowsAcceptanceBuilderConfig(baseConfig, version) {
  return {
    ...baseConfig,
    directories: {
      ...baseConfig.directories,
      output: resolveWindowsAcceptanceOutputDir(version)
    },
    extraMetadata: {
      ...baseConfig.extraMetadata,
      folioleBuildChannel: 'github',
      version
    }
  };
}

export function writeWindowsAcceptanceBuilderConfig(rootDir, baseConfigPath, version) {
  const baseConfig = JSON.parse(readFileSync(resolve(rootDir, baseConfigPath), 'utf8'));
  const outputPath = resolve(rootDir, WINDOWS_ACCEPTANCE_CONFIG);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(
    createWindowsAcceptanceBuilderConfig(baseConfig, version), null, 2
  )}\n`);
  return WINDOWS_ACCEPTANCE_CONFIG;
}
