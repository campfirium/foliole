// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_WORKSPACE_READ_RULES } from '../../lib/core/database/androidCompanionWorkspaceReadDefinitions.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUERY_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-query-definitions.json');
const SNAPSHOT_EXPORTER = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionWorkspaceSnapshotExporter.java');
const NODE_SNAPSHOT_BUILDER = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionWorkspaceNodeSnapshotBuilder.java');
const VIEW_STATE_EXPORTER = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionWorkspaceViewStateExporter.java');
const WORKSPACE_RULES = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionWorkspaceReadQueryRules.java');

describe('Android workspace read query rules', () => {
  it('generates workspace snapshot and view-state read metadata', async () => {
    const definitions = JSON.parse(await readFile(QUERY_DEFINITIONS, 'utf8'));

    expect(definitions.workspaceRead).toEqual(ANDROID_COMPANION_WORKSPACE_READ_RULES);
    expect(definitions.workspaceRead.groupKeys).toEqual({
      snapshot: 'snapshot',
      viewState: 'viewState'
    });
    expect(definitions.workspaceRead.snapshotShape).toMatchObject({
      nestedPayload: { outputKey: 'outputKey', stateRowKey: 'stateRowKey' },
      nodePayload: {
        attachmentsOutputKey: 'attachmentsOutputKey',
        bodyStatusOutputKey: 'bodyStatusOutputKey',
        bodyStatusRowKey: 'bodyStatusRowKey'
      }
    });
    expect(definitions.workspaceRead.snapshot).toMatchObject({
      deletedAtRowKey: 'deleted_at',
      metaValueQueryName: 'workspaceMetaValue',
      nodeIdRowKey: 'id',
      nodesQueryName: 'workspaceSnapshotNodes',
      orderedNodeIdsQueryName: 'workspaceOrderedNodeIds',
      outputKeys: {
        activeNodeId: 'activeNodeId',
        nodesById: 'nodesById'
      },
      untitledSequenceMetaKey: 'untitled_sequence_by_parent'
    });
    expect(definitions.workspaceRead.snapshot.nodePayload.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outputKey: 'parentNodeId', rowKey: 'parent_id' }),
        expect.objectContaining({ outputKey: 'desiredRetention', rowKey: 'desired_retention' }),
        expect.objectContaining({ outputKey: 'bodyBlobHash', rowKey: 'body_blob_hash' })
      ])
    );
    expect(definitions.workspaceRead.snapshot.readingPayload.validStates).toEqual(['active', 'done', 'dismissed']);
    expect(definitions.workspaceRead.snapshot.reviewPayload.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ outputKey: 'lastReviewAt', rowKey: 'last_review_at' })])
    );
    expect(definitions.workspaceRead.viewState).toMatchObject({
      defaultSource: 'user-scroll',
      nodeIdRowKey: 'node_id',
      queryName: 'nodeViewStatesByDevice',
      resultKey: 'states'
    });
    expect(definitions.workspaceRead.viewState.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outputKey: 'scrollTop', rowKey: 'scroll_top', type: 'nonNegativeLong' }),
        expect.objectContaining({ outputKey: 'selectionFrom', rowKey: 'selection_from', type: 'nullableNonNegativeLong' })
      ])
    );
  });

  it('keeps workspace Java exporters wired to generated read rules', async () => {
    const combinedSource = [
      await readFile(SNAPSHOT_EXPORTER, 'utf8'),
      await readFile(NODE_SNAPSHOT_BUILDER, 'utf8'),
      await readFile(VIEW_STATE_EXPORTER, 'utf8')
    ].join('\n');
    const rulesSource = await readFile(WORKSPACE_RULES, 'utf8');

    expect(combinedSource).toContain('FolioleCompanionWorkspaceReadQueryRules.snapshotString(context, key)');
    expect(combinedSource).toContain('FolioleCompanionWorkspaceReadQueryRules.viewStateString(context');
    expect(combinedSource).toContain('FolioleCompanionWorkspaceReadQueryRules.nodePayloadBodyStatusOutputKey(context, rules)');
    expect(combinedSource).toContain('FolioleCompanionWorkspaceReadQueryRules.nestedPayloadOutputKey(context, groupName)');
    expect(combinedSource).toContain('FolioleCompanionWorkspaceReadQueryRules.snapshotOutputKey(context, key)');
    expect(rulesSource).toContain('snapshotObject(context, "outputKeys").getString(key)');
    expect(rulesSource).toContain('snapshotShape(context, "nodePayload")');
    expect(combinedSource).toContain('FolioleCompanionQueryDefinitionShapeKeys.fieldOutputKey(context, field)');
    expect(combinedSource).toContain('FolioleCompanionQueryDefinitionShapeKeys.fieldRowKey(context, field)');
    expect(combinedSource).toContain('FolioleCompanionQueryDefinitionShapeKeys.fieldTypeKey(context, field)');
    expect(combinedSource).toContain('FolioleCompanionQueryDefinitionShapeKeys.fieldType(context, key)');
    expect(rulesSource).toContain('FolioleCompanionQueryAssetKeys.ruleGroup(context, "workspaceRead", groupName)');
    expect(combinedSource).not.toContain('field.getString("outputKey")');
    expect(combinedSource).not.toContain('field.getString("rowKey")');
    expect(combinedSource).not.toContain('field.getString("type")');
    expect(combinedSource).not.toContain('rules.getString("bodyStatusOutputKey")');
    expect(combinedSource).not.toContain('snapshotObject(context, groupName).getString(key)');
    expect(combinedSource).not.toContain('outputKeys.getString("activeNodeId")');
    expect(combinedSource).not.toContain('"parentNodeId"');
    expect(combinedSource).not.toContain('"scrollTop"');
    expect(combinedSource).not.toContain('"selectionFrom"');
    expect(combinedSource).not.toContain('snapshot.put("activeNodeId"');
    expect(combinedSource).not.toContain('"workspaceSnapshotNodes"');
    expect(combinedSource).not.toContain('"workspaceOrderedNodeIds"');
    expect(combinedSource).not.toContain('"nodeViewStatesByDevice"');
    expect(combinedSource).not.toContain('"__CONTENT_EXPRESSION__"');
    expect(combinedSource).not.toContain('"user-scroll"');
  });
});
