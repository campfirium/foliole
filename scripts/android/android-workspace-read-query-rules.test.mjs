// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_WORKSPACE_READ_RULES } from '../../lib/core/database/androidCompanionResourceQueryDefinitions.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUERY_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-query-definitions.json');
const SNAPSHOT_EXPORTER = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionWorkspaceSnapshotExporter.java');
const VIEW_STATE_EXPORTER = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionWorkspaceViewStateExporter.java');
const WORKSPACE_RULES = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionWorkspaceReadQueryRules.java');

describe('Android workspace read query rules', () => {
  it('generates workspace snapshot and view-state read metadata', async () => {
    const definitions = JSON.parse(await readFile(QUERY_DEFINITIONS, 'utf8'));

    expect(definitions.workspaceRead).toEqual(ANDROID_COMPANION_WORKSPACE_READ_RULES);
    expect(definitions.workspaceRead.snapshot).toMatchObject({
      metaValueQueryName: 'workspaceMetaValue',
      nodesQueryName: 'workspaceSnapshotNodes',
      orderedNodeIdsQueryName: 'workspaceOrderedNodeIds',
      untitledSequenceMetaKey: 'untitled_sequence_by_parent'
    });
    expect(definitions.workspaceRead.viewState).toMatchObject({
      defaultSource: 'user-scroll',
      queryName: 'nodeViewStatesByDevice',
      resultKey: 'states'
    });
  });

  it('keeps workspace Java exporters wired to generated read rules', async () => {
    const combinedSource = `${await readFile(SNAPSHOT_EXPORTER, 'utf8')}\n${await readFile(VIEW_STATE_EXPORTER, 'utf8')}`;
    const rulesSource = await readFile(WORKSPACE_RULES, 'utf8');

    expect(combinedSource).toContain('FolioleCompanionWorkspaceReadQueryRules.snapshotString(context, key)');
    expect(combinedSource).toContain('FolioleCompanionWorkspaceReadQueryRules.viewStateString(context');
    expect(rulesSource).toContain('optJSONObject("workspaceRead")');
    expect(combinedSource).not.toContain('"workspaceSnapshotNodes"');
    expect(combinedSource).not.toContain('"workspaceOrderedNodeIds"');
    expect(combinedSource).not.toContain('"nodeViewStatesByDevice"');
    expect(combinedSource).not.toContain('"__CONTENT_EXPRESSION__"');
    expect(combinedSource).not.toContain('"user-scroll"');
  });
});
