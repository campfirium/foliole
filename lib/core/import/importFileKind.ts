import type { ImportSourceKind } from './contract.js';

const KINDS_BY_EXTENSION: Readonly<Record<string, ImportSourceKind>> = {
  '.txt': 'text', '.md': 'markdown', '.markdown': 'markdown', '.html': 'html', '.htm': 'html',
  '.epub': 'epub', '.pdf': 'pdf'
};

export function resolveImportFileKind(extension: string): ImportSourceKind {
  const kind = KINDS_BY_EXTENSION[extension.toLowerCase()];
  if (!kind) throw new Error(`unsupported import file extension: ${extension || '(none)'}`);
  return kind;
}
