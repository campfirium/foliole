import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  dependencies: Record<string, string>;
};

const reactPdfPackageJson = JSON.parse(readFileSync('node_modules/react-pdf/package.json', 'utf8')) as {
  dependencies: Record<string, string>;
};

it('keeps the bundled PDF worker version aligned with react-pdf PDF.js API version', () => {
  expect(packageJson.dependencies['pdfjs-dist']).toBe(reactPdfPackageJson.dependencies['pdfjs-dist']);
});
