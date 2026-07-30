const PREVIEW_SHARED_PATHS = [
  'scripts/preview/preview-dedupe-scheduler.mjs',
  'scripts/preview/preview-dedupe-scheduler-state.mjs',
  'scripts/preview/preview-dedupe-scheduler-timeout.mjs',
  'scripts/preview/preview-dedupe-state-store.mjs',
  'scripts/preview/preview-dedupe-event-log.mjs',
  'scripts/preview/preview-dedupe-targets.mjs',
  'scripts/preview/preview-dedupe-time-budget.mjs',
  'scripts/preview/preview-dedupe-wait-status.mjs',
  'scripts/preview/preview-dedupe-command-runner.mjs',
  'scripts/preview/preview-dedupe.mjs'
];

export const DEPENDENCY_ROOT_PATTERN = /^(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/u;
export const TEST_FILE_PATTERN = /\.(test|spec)\.[^.]+$/u;
export const LINTABLE_FILE_PATTERN = /\.(js|jsx|ts|tsx|cjs|mjs)$/u;
export const SYNC_PACK_PATH_PATTERN = /^(lib\/core\/sync\/syncPack|electron\/database\/syncPack|electron\/sync\/syncPack|src\/shared\/platform\/companionSyncPack)/u;
export const ANDROID_CONTRACT_PATH_PATTERN = /^lib\/core\/database\/androidCompanion.*\.ts$/u;
export const ANDROID_SYNC_BOUNDARY_PATH_PATTERN =
  /^(lib\/core\/database\/androidCompanion.*\.ts|android\/app\/src\/main\/assets\/companion-.*\.json|android\/app\/src\/main\/java\/com\/foliole\/android\/FolioleCompanionSync.*\.java)/u;
export const LINT_SCOPE_PATHS = {
  desktop: [
    'src/app/',
    'src/features/',
    'src/shared/ui/',
    'src/shared/platform/',
    'electron/',
    'scripts/windows/',
    'vite.config.ts',
    'playwright.desktop.config.ts'
  ],
  android: [
    'src/companion/',
    'src/shared/platform/',
    'src/shared/ui/',
    'src/shared/lib/',
    'src/shared/commands/',
    'src/shared/config/',
    'scripts/android/',
    'android/',
    'capacitor.config.ts',
    'vite.companion.config.ts'
  ],
  shared: [
    'src/shared/',
    'src/features/',
    'src/store/',
    'scripts/check-',
    'scripts/layer-',
    'scripts/lint-changed',
    'scripts/quality-',
    'scripts/quality/',
    'scripts/lib/',
    'scripts/vite-config',
    'vite.config.ts',
    'vite.companion.config.ts',
    'playwright.desktop.config.ts',
    'capacitor.config.ts'
  ]
};

export const PREVIEW_TARGET_PATHS = {
  android: [
    'android/',
    ...PREVIEW_SHARED_PATHS,
    'scripts/android/',
    'src/companion/',
    'src/app/styles.css',
    'src/app/tokens/',
    'src/app/generated/appearance-colors.css',
    'electron/startupSkeletonLayout.ts',
    'src/shared/',
    'src/features/',
    'lib/',
    'package.json',
    'package-lock.json',
    'index.html',
    'public/favicon.ico',
    'public/favicon.png',
    'tailwind.config.js',
    'capacitor.config.ts',
    'vite.shared.ts',
    'vite.companion.config.ts'
  ],
  windows: [
    'electron/',
    ...PREVIEW_SHARED_PATHS,
    'scripts/electron-dev-env.mjs',
    'scripts/electron-dev-server.mjs',
    'scripts/electron-dev.mjs',
    'scripts/windows/',
    'src/global.d.ts',
    'src/main.tsx',
    'src/app/',
    'src/features/',
    'src/shared/',
    'src/startupBootstrap.ts',
    'src/startupViewMode.ts',
    'src/store/',
    'lib/',
    'package.json',
    'package-lock.json',
    'index.html',
    'vite.config.ts',
    'playwright.desktop.config.ts'
  ]
};

export function pathMatchesPrefix(filePath, prefixes) {
  return prefixes.some((prefix) => filePath === prefix || filePath.startsWith(prefix));
}
