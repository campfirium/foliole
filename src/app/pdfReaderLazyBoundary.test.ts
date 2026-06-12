import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const LAZY_PDF_BOUNDARY_FILES = [
  'src/app/components/documentPanelPdfView.tsx',
  'src/app/components/PdfDocumentSurfaceCache.tsx',
  'src/companion/CompanionReadableArticleDocument.tsx'
];

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('PDF reader lazy boundary', () => {
  it('keeps ordinary reading surfaces from statically importing PDF readers', () => {
    const combined = LAZY_PDF_BOUNDARY_FILES.map(readWorkspaceFile).join('\n');

    expect(combined).not.toMatch(/import\s+\{?\s*PdfDocumentSurface\b[\s\S]*?from\s+['"]\.\/PdfDocumentSurface['"]/);
    expect(combined).not.toMatch(/import\s+\{?\s*SimplePdfDocument\b[\s\S]*?from\s+['"]@\/features\/pdf\/components\/SimplePdfDocument['"]/);
    expect(combined).not.toContain("from 'react-pdf'");
  });
});
