// @vitest-environment node

import fs from 'node:fs/promises';
import path from 'node:path';

export function createPersistedRecord(
  prepared: {
    contentFingerprint: string;
    degradedReason: string | null;
    importedAt: string;
    provider: 'desktop_text_file';
    sourceFingerprint: string;
    sourceKind: 'epub' | 'html' | 'markdown' | 'text';
    sourceLocator: string;
    sourceName: string;
  },
  overrides?: Partial<{ failureReason: string | null; nodeId: string | null; resultStatus: 'degraded' | 'failed' | 'imported' }>
) {
  return {
    contentFingerprint: prepared.contentFingerprint,
    degradedReason: overrides?.resultStatus === 'failed' ? null : prepared.degradedReason,
    duplicateSemantic: 'new' as const,
    failureReason: overrides?.failureReason ?? null,
    importId: `import-${prepared.sourceName}`,
    importedAt: prepared.importedAt,
    nodeId: overrides?.nodeId ?? `node-${prepared.sourceName}`,
    provider: prepared.provider,
    resultStatus: overrides?.resultStatus ?? (prepared.degradedReason ? 'degraded' : 'imported'),
    sourceFingerprint: prepared.sourceFingerprint,
    sourceKind: prepared.sourceKind,
    sourceLocator: prepared.sourceLocator,
    sourceName: prepared.sourceName
  };
}

export async function createTempRoot(prefix: string, tempRoots: string[]) {
  const parentDir = path.join(process.cwd(), '.tmp-tests');
  await fs.mkdir(parentDir, { recursive: true });
  const root = await fs.mkdtemp(path.join(parentDir, `${prefix}-`));
  tempRoots.push(root);
  return root;
}
