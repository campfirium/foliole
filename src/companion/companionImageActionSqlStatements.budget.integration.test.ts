// @vitest-environment node
import { writeFileSync } from 'node:fs';

import { afterEach, expect, it, vi } from 'vitest';

// Statement budget for the phone's image edits, as companionActionSqlStatements.budget counts the everyday actions:
// every statement is one bridge round trip. FOLIOLE_SQL_BUDGET_REPORT=<file> writes the counted statements;
// FOLIOLE_SQL_BUDGET_REMOTE_APPLY=1 stores the versions through the remote apply chain instead, for comparisons.
const remote = vi.hoisted(() => process.env.FOLIOLE_SQL_BUDGET_REMOTE_APPLY === '1');

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false, convertFileSrc: (url: string) => url },
    registerPlugin: () => ({ ...createCompanionNativeSyncStub(),
      resolveAttachmentResource: () => Promise.resolve({ status: 'ready', resource_url: 'data:image/png;base64,png' }) }) };
});
vi.mock('../../lib/core/sync/localNodeVersionApply', async importOriginal => {
  const original = await importOriginal<typeof import('../../lib/core/sync/localNodeVersionApply')>();
  const { applySyncNodesWithDbPort } = await import('../../lib/core/sync/syncNodeApplyExecutor');
  return { ...original, applyLocalNodeVersionsWithDbPort: (...args: Parameters<typeof original.applyLocalNodeVersionsWithDbPort>) =>
    remote ? applySyncNodesWithDbPort(args[0], args[1], { enqueueSearchInvalidations: false, includeAlreadyApplied: true, operation: args[2] })
      : original.applyLocalNodeVersionsWithDbPort(...args) };
});

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { sqlRecording } from '../../lib/core/diagnostics/sqlRecording';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { collectImageMatches } from '../features/editor/model/markdownImageMatches';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { editableNode } from '../shared/platform/companion/editing/companionContentEditingStable.testSupport';
import { createCompanionImageCloze, saveCompanionImageCloze, type CompanionImageClozeRequest } from '../shared/platform/companion/editing/companionImageCloze';
import { deleteCompanionImageCloze } from '../shared/platform/companion/editing/companionImageClozeDeletion';
import { getCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { commitCompanionImageArticle, readCompanionImageArticle } from '../shared/platform/companion/runtime/companionArticleImageStore';
import { createSearchLibrary, recordAfterPendingBodyReleases } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';

let counted: string[] | null = null;
const originalBegin = sqlRecording.begin.bind(sqlRecording);
sqlRecording.begin = (sql: string, method: string, host: string) => {
  counted?.push(`[${method}] ${sql.replace(/\s+/gu, ' ').trim().slice(0, 160)}`);
  return originalBegin(sql, method, host);
};

const hash = 'a'.repeat(64);
const key = `${hash}.png`;
const content = `Before\n\n![local](asset://${key})\n\nAfter`;
let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
afterEach(async () => { await library?.close(); library = null; });

const topicVersion = () => library!.database.prepare("SELECT current_version_id FROM nodes WHERE id = 'topic'").pluck().get() as string;

function cloze(regionIds: string[]): CompanionImageClozeRequest {
  const image = collectImageMatches(0, content)[0]!;
  return { nodeId: 'new-item', parentNodeId: 'topic', expectedContent: content, expectedVersionId: topicVersion(),
    imageRange: { from: image.from, to: image.to }, scope: getCompanionReadingScope(),
    regions: regionIds.map((id, index) => ({ attachmentId: hash, id, answer: '', x: 0.1 + index * 0.4, y: 0.3, width: 0.3, height: 0.2 })) };
}

async function openTopic() {
  library = await createSearchLibrary(100, 16);
  const topic = await toWorkspaceNativeNodeVersion(editableNode({ content,
    resourceReferences: [{ storage_key: key, original_name: 'Diagram.png', role: 'image' }] }), 'source', 'topic-version');
  await getIosCompanionDatabaseOwner().runWriter(db => applySyncNodesWithDbPort(db, [topic], { enqueueSearchInvalidations: false }), { kind: 'business' });
  await refreshCompanionWorkspaceAfterMutation(null);
}

// Write budgets in statements, with a small margin over the audited count.
const ACTIONS: Record<string, { budget: number; prepare?: () => Promise<unknown>; write: () => Promise<unknown> }> = {
  'article image': { budget: 9, write: async () => {
    const before = (await readCompanionImageArticle('topic'))!;
    await commitCompanionImageArticle('topic', before, { content: `${before.content}\n\n![image](asset://${'b'.repeat(64)}.png)`,
      imageSources: { [`${'b'.repeat(64)}.png`]: 'https://example.com/image.png' } });
  } },
  'image cloze creation': { budget: 26, write: () => createCompanionImageCloze(cloze(['region-1', 'region-2'])) },
  'image cloze region edit': { budget: 15, prepare: () => createCompanionImageCloze(cloze(['region-1', 'region-2'])), write: () => {
    const request = cloze(['region-1']);
    const before = request.regions[0]!;
    return saveCompanionImageCloze({ ...request, nodeId: 'edit-session', regions: [], edits: [{ before, after: { ...before, x: 0.05 } }] });
  } },
  'image cloze deletion': { budget: 25, prepare: () => createCompanionImageCloze(cloze(['region-1', 'region-2'])),
    write: () => deleteCompanionImageCloze({ ...cloze([]), attachmentId: hash, regionId: 'region-2' }) }
};

const report: string[] = [];
const reportFile = process.env.FOLIOLE_SQL_BUDGET_REPORT;
afterEach(() => { if (reportFile && report.length) writeFileSync(reportFile, `${report.join('\n\n')}\n`); });

for (const [name, action] of Object.entries(ACTIONS)) {
  it(`keeps a phone ${name} within its statement budget`, async () => {
    await openTopic();
    await action.prepare?.();
    await refreshCompanionWorkspaceAfterMutation();
    await recordAfterPendingBodyReleases('image-action-budget');
    counted = [];
    try { await action.write(); } finally { sqlRecording.stop(); }
    const statements = counted;
    counted = null;
    if (reportFile) report.push(`=== ${name}: write ${statements.length}\n${statements.map((sql, index) => `#${index + 1} ${sql}`).join('\n')}`);
    expect(statements.length <= action.budget, `${name}: write ${statements.length} (budget ${action.budget})\n${statements.join('\n')}`).toBe(true);
  });
}
