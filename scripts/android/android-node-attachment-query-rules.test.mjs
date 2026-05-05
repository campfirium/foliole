// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_NODE_ATTACHMENT_READ_RULES } from '../../lib/core/database/androidCompanionResourceQueryDefinitions.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUERY_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-query-definitions.json');
const NODE_ATTACHMENT_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionNodeAttachmentStore.java');
const NODE_ATTACHMENT_RULES = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionNodeAttachmentQueryRules.java');

describe('Android node attachment read query rules', () => {
  it('generates node attachment read metadata', async () => {
    const definitions = JSON.parse(await readFile(QUERY_DEFINITIONS, 'utf8'));

    expect(definitions.nodeAttachmentRead).toEqual(ANDROID_COMPANION_NODE_ATTACHMENT_READ_RULES);
    expect(definitions.nodeAttachmentRead.groupKeys).toEqual({
      backfillSnapshots: 'backfillSnapshots',
      nodeAttachments: 'nodeAttachments'
    });
    expect(definitions.nodeAttachmentRead.backfillSnapshots).toMatchObject({
      attachmentIdKey: 'attachment_id',
      attachmentsKey: 'attachments',
      idKey: 'id',
      queryName: 'nodeAttachmentBackfillSnapshots',
      roleKey: 'role',
      resultKey: 'snapshots',
      snapshotJsonKey: 'snapshot_json'
    });
    expect(definitions.nodeAttachmentRead.nodeAttachments).toMatchObject({
      queryName: 'nodeAttachments',
      resultKey: 'attachments'
    });
  });

  it('keeps node attachment Java store wired to generated read rules', async () => {
    const storeSource = await readFile(NODE_ATTACHMENT_STORE, 'utf8');
    const rulesSource = await readFile(NODE_ATTACHMENT_RULES, 'utf8');

    expect(storeSource).toContain('FolioleCompanionNodeAttachmentQueryRules.backfillSnapshotString(context, key)');
    expect(storeSource).toContain('FolioleCompanionNodeAttachmentQueryRules.nodeAttachmentString(context, key)');
    expect(rulesSource).toContain('FolioleCompanionQueryAssetKeys.ruleGroup(context, "nodeAttachmentRead", groupName)');
    expect(storeSource).not.toContain('"nodeAttachmentBackfillSnapshots"');
    expect(storeSource).not.toContain('"nodeAttachments"');
    expect(storeSource).not.toContain('"snapshots"');
    expect(storeSource).not.toContain('"snapshot_json"');
    expect(storeSource).not.toContain('optJSONArray("attachments"');
    expect(storeSource).not.toContain('optString("attachment_id"');
    expect(storeSource).not.toContain('optString("role"');
  });
});
