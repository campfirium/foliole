const config = {
  entry: [
    'index.html',
    'src/main.tsx',
    'src/companion/index.html',
    'vite.config.ts',
    'vite.companion.config.ts',
    'vite.shared.ts',
    'playwright.config.ts',
    'playwright.desktop.config.ts',
    'electron/main.ts',
    'electron/preload.cjs',
    'scripts/**/*.{js,mjs,ts}',
    'tests/**/*.{ts,tsx}',
    'src/**/*.{test,spec}.{ts,tsx}'
  ],
  project: [
    'electron/**/*.{ts,cjs}',
    'lib/**/*.{ts,tsx}',
    'scripts/**/*.{js,mjs,ts}',
    'src/**/*.{ts,tsx}',
    'tests/**/*.{ts,tsx}',
    '*.config.{js,ts}',
    'vite.shared.ts'
  ],
  ignoreBinaries: [
    'cmd.exe',
    'codex',
    'ditto',
    'git.exe',
    'netstat.exe',
    'powershell.exe',
    'ps',
    'python3',
    'rg',
    'sqlite3',
    'taskkill',
    'taskkill.exe',
    'where.exe',
    'wslpath',
    'xcrun'
  ],
  ignoreDependencies: [
    '@capacitor/android',
    '@capacitor/core',
    '@lezer/common',
    '@lezer/highlight',
    'prettier'
  ]
};

export default config;
