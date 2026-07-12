export const WINDOWS_VALIDATION_KIT_SCHEMA_VERSION = 1;
export const WINDOWS_VALIDATION_REQUIRED_NODE_MAJOR = 22;
export const WINDOWS_VALIDATION_RUNTIME_PACKAGES = [
  '@playwright/test',
  'playwright',
  'playwright-core'
];

export const WINDOWS_VALIDATION_PHYSICAL_SPECS = [
  'tests/desktop/global-capture-panel.spec.ts',
  'tests/desktop/global-capture-toast-navigation.spec.ts',
  'tests/desktop/visible-native-presentation.spec.ts'
];

export const WINDOWS_VALIDATION_SOURCE_ENTRIES = [
  'scripts/windows/installed-app-smoke.mjs',
  'scripts/windows/windows-validation-kit-playwright.config.mjs',
  'scripts/windows/windows-validation-kit-runner.mjs',
  ...WINDOWS_VALIDATION_PHYSICAL_SPECS
];

export const WINDOWS_VALIDATION_EXTRA_ASSETS = [
  'scripts/windows/windows-native-mouse-click.ps1'
];

export const WINDOWS_VALIDATION_ALLOWED_BARE_IMPORTS = new Set([
  '@playwright/test',
  'playwright'
]);
