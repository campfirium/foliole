import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SCAN_ROOTS = ['src/app/components', 'src/features', 'src/shared/ui'];
const SPECIALIZED_SURFACE_PATTERN = /\b(?:bg-bg-(?:panel|elevated)(?:\/\d+)?|rounded-(?:xl|2xl))\b/;
const ALLOWED_SPECIALIZED_SURFACE_FILES = [
  'src/app/components/CompanionPairingRequestsDialog.tsx',
  'src/app/components/EditorInputDiagnosticsPanel.tsx',
  'src/app/components/PdfPageCanvas.tsx',
  'src/app/components/PdfDocumentPageRender.tsx',
  'src/app/components/ReadwiseReaderSetupParts.tsx',
  'src/app/components/WorkspaceDemoViewportGate.tsx',
  'src/app/components/documentPanelPdfView.tsx',
  'src/shared/ui/ListSurface.tsx'
].sort();

function collectSourceFiles(dir: string, files: string[] = []) {
  for (const entry of readdirSync(join(process.cwd(), dir))) {
    const path = join(dir, entry);
    const stats = statSync(join(process.cwd(), path));
    if (stats.isDirectory()) {
      collectSourceFiles(path, files);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) {
      files.push(path.replaceAll('\\', '/'));
    }
  }
  return files;
}

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('specialized surface allowlist', () => {
  it('keeps remaining generic bg surface usage explicitly classified', () => {
    const offenders = SCAN_ROOTS.flatMap((root) => collectSourceFiles(root))
      .filter((file) => SPECIALIZED_SURFACE_PATTERN.test(readWorkspaceFile(file)))
      .sort();

    expect(offenders).toEqual(ALLOWED_SPECIALIZED_SURFACE_FILES);
  });
});
