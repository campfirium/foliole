const config = {
  entry: [
    'index.html',
    'src/main.tsx',
    'vite.config.ts',
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
    '*.config.{js,ts}'
  ],
  ignoreDependencies: ['prettier']
};

export default config;
