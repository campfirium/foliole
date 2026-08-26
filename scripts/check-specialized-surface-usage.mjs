/* global console, process */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SPECIALIZED_SURFACE_SCAN_ROOTS = ['src/app/components', 'src/features', 'src/shared/ui'];
export const SPECIALIZED_SURFACE_PATTERN = /\b(?:bg-bg-(?:panel|elevated)(?:\/\d+)?|rounded-(?:xl|2xl))\b/u;
export const ALLOWED_SPECIALIZED_SURFACE_FILES = [
  'src/app/components/SyncGroupJoinRequestsDialog.tsx',
  'src/app/components/EditorInputDiagnosticsPanel.tsx',
  'src/app/components/PdfDocumentPageRender.tsx',
  'src/app/components/PdfPageCanvas.tsx',
  'src/app/components/ReadwiseReaderSetupParts.tsx',
  'src/app/components/WorkspaceDemoViewportGate.tsx',
  'src/app/components/documentPanelPdfView.tsx',
  'src/shared/ui/ListSurface.tsx'
].sort();

function collectSourceFiles(dir, files = []) {
  for (const entry of readdirSync(join(process.cwd(), dir))) {
    const filePath = join(dir, entry);
    const stats = statSync(join(process.cwd(), filePath));
    if (stats.isDirectory()) {
      collectSourceFiles(filePath, files);
      continue;
    }
    if (/\.(ts|tsx)$/u.test(entry) && !/\.test\./u.test(entry)) {
      files.push(filePath.replaceAll('\\', '/'));
    }
  }
  return files;
}

function readWorkspaceFile(filePath) {
  return readFileSync(join(process.cwd(), filePath), 'utf8');
}

export function collectSpecializedSurfaceFiles() {
  return SPECIALIZED_SURFACE_SCAN_ROOTS.flatMap((root) => collectSourceFiles(root))
    .filter((file) => SPECIALIZED_SURFACE_PATTERN.test(readWorkspaceFile(file)))
    .sort();
}

export function findUnexpectedSpecializedSurfaceFiles() {
  const allowed = new Set(ALLOWED_SPECIALIZED_SURFACE_FILES);
  return collectSpecializedSurfaceFiles().filter((file) => !allowed.has(file));
}

function main() {
  const unexpected = findUnexpectedSpecializedSurfaceFiles();
  if (unexpected.length === 0) {
    console.log('[specialized-surface] usage classified');
    return;
  }

  console.error('[specialized-surface] unclassified specialized surface token usage:');
  for (const file of unexpected) {
    console.error(`  ${file}`);
  }
  console.error('[specialized-surface] use shared surface helpers or explicitly classify the exception.');
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
